-- The coach, step E: the person drags the blocks of an open draft before applying it (spec 22).
-- Run once in the Supabase SQL editor after the event to-dos file.
--
-- Additive: the main branch and the branches 19-coach, 20-coach-changes and 21-event-todos run against
-- the same database and keep working unchanged. One new column with a default, one new trigger that
-- fires only on changes of a draft's content (which none of the earlier code makes) and one new
-- function. Nothing is removed, renamed or made stricter for what the earlier code does.
--
-- Security model, as in the earlier chat files: our server runs as the role "authenticated" with the
-- signed-in user's id. The user's role gets no new right on the table: it still may not update a
-- draft's new events, changes or version (the grants of the chat file are unchanged). Changing the
-- times of one block goes only through app.chat_edit_draft, a security definer function that works on
-- auth.uid()'s own open draft, changes nothing but the start and end of one new event or of one move,
-- and checks again what the database can check. Our server runs R23's checks (overlaps, the 14 days,
-- not in the past) on the whole draft before it calls the function, as for accept_draft.

-- ---------- The draft's version (R4) ----------
-- 0 for a draft as the assistant wrote it; one more for each change by the person. The screen sends
-- the version it last saw, and a change carrying an older one is refused (another device changed the
-- draft first). A draft with a version above 0 is "adjusted by the person" (the history sent to Claude
-- says so).
alter table app.draft_plans
  add column version integer not null default 0;

alter table app.draft_plans
  add constraint draft_plans_version check (version >= 0);

-- ---------- Only an open draft's content changes, and only one version at a time ----------
-- Fires only when the new events, the changes or the version are written, which only
-- app.chat_edit_draft does. A draft that is not open any more keeps its content for ever (what was
-- applied is what the history shows), and the version moves on by exactly one with each change.
create function app.check_draft_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'open' or new.status <> 'open' then
    raise exception 'This draft is no longer open' using errcode = '23514', constraint = 'draft_plans_status_forward';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'A change of a draft moves its version on by one' using errcode = '23514', constraint = 'draft_plans_version_step';
  end if;
  return new;
end;
$$;

revoke all on function app.check_draft_edit() from public, anon, authenticated;

create trigger check_draft_edit
  before update of proposed_events, changes, version on app.draft_plans
  for each row execute function app.check_draft_edit();

-- ---------- edit_draft ----------
-- Sets the new start and end of one block of the user's open draft: a new event (by its place in the
-- list, from 0) or a move (by the id of the event it moves). Exactly one of the two is given.
-- Checks again, under a row lock on the draft (two devices take turns):
--   * the draft is the user's ("Not found" otherwise) and still open;
--   * the version is the one the screen last saw (otherwise "Changed on another device");
--   * the block exists: a new event at that place, or a move (never a delete) of that event;
--   * the times obey the draft's own limits: end after start; a new event lasts 15 minutes to 8 hours
--     (as app.chat_apply_draft checks), a moved event at most 24 hours (as edit_event).
-- Nothing else of the draft changes: title, goal, to-dos, the event a move names and the version of
-- that event the draft saw all stay. Times are stored as the server stores them (UTC, ISO).
-- Returns the draft's new version.
create function app.chat_edit_draft(
  p_draft_id uuid,
  p_version integer,
  p_index integer,
  p_event_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  draft record;
  place integer;
  start_text text;
  end_text text;
  new_version integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select d.id, d.status, d.version, d.proposed_events, d.changes into draft
    from app.draft_plans d where d.id = p_draft_id and d.user_id = uid for update;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  if draft.status <> 'open' then
    raise exception 'This draft is no longer open' using errcode = '23514', constraint = 'draft_plans_status_forward';
  end if;
  if p_version is null or draft.version <> p_version then
    raise exception 'Changed on another device' using errcode = '23514', constraint = 'draft_plans_stale';
  end if;
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'End must be after start' using errcode = '23514', constraint = 'draft_plans_edit_times';
  end if;

  start_text := to_char(p_start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  end_text := to_char(p_end_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  if p_index is not null and p_event_id is null then
    if p_index < 0 or p_index >= jsonb_array_length(draft.proposed_events) then
      raise exception 'Not found' using errcode = 'P0002';
    end if;
    if p_end_at - p_start_at not between interval '15 minutes' and interval '8 hours' then
      raise exception 'A proposed event must last 15 minutes to 8 hours' using errcode = '23514', constraint = 'draft_plans_event_length';
    end if;
    update app.draft_plans
       set proposed_events = jsonb_set(
             jsonb_set(proposed_events, array[p_index::text, 'start_at'], to_jsonb(start_text)),
             array[p_index::text, 'end_at'], to_jsonb(end_text)),
           version = version + 1
     where id = draft.id
    returning version into new_version;
  elsif p_event_id is not null and p_index is null then
    select (x.n - 1)::integer into place
      from jsonb_array_elements(draft.changes) with ordinality as x(value, n)
     where jsonb_typeof(x.value) = 'object' and x.value ->> 'kind' = 'move' and x.value ->> 'event_id' = p_event_id::text
     limit 1;
    if place is null then raise exception 'Not found' using errcode = 'P0002'; end if;
    if p_end_at - p_start_at > interval '24 hours' then
      raise exception 'An event can last at most 24 hours' using errcode = '23514', constraint = 'draft_plans_move_length';
    end if;
    update app.draft_plans
       set changes = jsonb_set(
             jsonb_set(changes, array[place::text, 'start_at'], to_jsonb(start_text)),
             array[place::text, 'end_at'], to_jsonb(end_text)),
           version = version + 1
     where id = draft.id
    returning version into new_version;
  else
    raise exception 'Give either a new event or a move' using errcode = '22023';
  end if;

  return new_version;
end;
$$;

revoke all on function app.chat_edit_draft(uuid, integer, integer, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function app.chat_edit_draft(uuid, integer, integer, uuid, timestamptz, timestamptz) to authenticated;
