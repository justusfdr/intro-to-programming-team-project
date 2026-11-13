-- The coach, step C: drafts that also move and delete existing events, and undo (spec 20).
-- Run once in the Supabase SQL editor after the chat file.
--
-- Additive: the main branch and the branch 19-coach run against the same database and keep working
-- unchanged. New columns have defaults; the only loosened limits are the ones spec 20 names: a draft's
-- list of new events may be empty when it has changes, and the new final status "undone", reached from
-- "accepted" only through app.chat_undo_draft. One old function gets one refusal more, for drafts only
-- the new code writes (see app.chat_accept_draft below).
--
-- Security model, as in the chat file: our server runs as the role "authenticated" with the signed-in
-- user's id. The user's role may write a draft's proposal (new events and changes) when it saves the
-- answer, and nothing else of it. Applying a draft and undoing it run in two security definer
-- functions that work on auth.uid()'s rows only and check again what the database can check. The undo
-- data is written only by those functions, from the rows themselves, never from anything the user's
-- role sends, so it cannot be forged to make the database write something the user could not write.

-- ---------- Drafts: changes and undo data ----------
-- changes: the moves and deletes of existing events the assistant proposed, a list of
--   { "kind": "move" | "delete", "event_id", "updated_at" (the event's version the draft saw),
--     "title", "goal_id", "old_start_at", "old_end_at" (for showing the draft later),
--     "start_at", "end_at" (the new times of a move; null for a delete) }, all times UTC ISO.
-- undo: set when the draft is applied, by app.chat_apply_draft only:
--   { "created": [{ "id", "updated_at" }], "moved": [{ "id", "updated_at", "old_start_at", "old_end_at" }],
--     "deleted": [{ the deleted event's fields }] }
alter table app.draft_plans
  add column changes jsonb not null default '[]'::jsonb,
  add column undo jsonb;

-- Loosened: 1 to 30 things in all (new events and changes together), so the list of new events may be
-- empty when the draft has changes. Same name as before, so a refusal reads the same.
alter table app.draft_plans drop constraint draft_plans_events_list;
alter table app.draft_plans add constraint draft_plans_events_list check (
  case
    when jsonb_typeof(proposed_events) = 'array' and jsonb_typeof(changes) = 'array'
      then jsonb_array_length(proposed_events) + jsonb_array_length(changes) between 1 and 30
    else false
  end
);

-- Loosened: the new final status "undone".
alter table app.draft_plans drop constraint draft_plans_status;
alter table app.draft_plans add constraint draft_plans_status check (status in ('open', 'accepted', 'rejected', 'replaced', 'undone'));

-- The status still only moves forward: open -> accepted, rejected or replaced; accepted -> undone.
-- "accepted" is set only by the apply functions and "undone" only by app.chat_undo_draft (both run as
-- the owner), never by a user's own update.
create or replace function app.check_draft_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'open' then
      raise exception 'A new draft is open' using errcode = '23514', constraint = 'draft_plans_status_forward';
    end if;
    if not exists (select 1 from app.chat_messages m where m.id = new.message_id and m.role = 'assistant') then
      raise exception 'A draft belongs to an assistant message' using errcode = '23514', constraint = 'draft_plans_assistant_message';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'accepted' and new.status = 'undone' then
      if current_user = 'authenticated' then
        raise exception 'Only undo_draft undoes a draft' using errcode = '42501';
      end if;
      return new;
    end if;
    if old.status <> 'open' then
      raise exception 'This draft is no longer open' using errcode = '23514', constraint = 'draft_plans_status_forward';
    end if;
    if new.status = 'undone' then
      raise exception 'Only an accepted draft can be undone' using errcode = '23514', constraint = 'draft_plans_status_forward';
    end if;
    if new.status = 'accepted' and current_user = 'authenticated' then
      raise exception 'Only accept_draft accepts a draft' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- The user's role may add a draft's changes together with its new events (send_message); never change
-- them afterwards, and never write the undo data.
grant insert (changes) on app.draft_plans to authenticated;

-- ---------- The old accept function ----------
-- Unchanged for every draft the code of main and 19-coach writes. A draft with changes (only the new
-- code writes those) is refused here, so the old code cannot accept it while dropping its moves and
-- deletes; the new code uses app.chat_apply_draft.
create or replace function app.chat_accept_draft(p_draft_id uuid)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  draft record;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select d.id, d.status, d.proposed_events, d.changes into draft
    from app.draft_plans d where d.id = p_draft_id and d.user_id = uid for update;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  if draft.status <> 'open' then
    raise exception 'This draft is no longer open' using errcode = '23514', constraint = 'draft_plans_status_forward';
  end if;
  if jsonb_array_length(draft.changes) > 0 then
    raise exception 'This draft is out of date. Ask again' using errcode = '23514', constraint = 'draft_plans_out_of_date';
  end if;

  if exists (
    select 1 from jsonb_array_elements(draft.proposed_events) x
     where (x.value ->> 'end_at')::timestamptz - (x.value ->> 'start_at')::timestamptz
           not between interval '15 minutes' and interval '8 hours'
  ) then
    raise exception 'A proposed event must last 15 minutes to 8 hours' using errcode = '23514', constraint = 'draft_plans_event_length';
  end if;

  return query
    insert into app.events (user_id, source, title, all_day, start_at, end_at, goal_id, may_overlap)
    select uid, 'assistant', x.value ->> 'title', false,
           (x.value ->> 'start_at')::timestamptz, (x.value ->> 'end_at')::timestamptz,
           nullif(x.value ->> 'goal_id', '')::uuid, false
      from jsonb_array_elements(draft.proposed_events) with ordinality as x(value, n)
     order by x.n
    returning id;

  update app.draft_plans set status = 'accepted' where id = draft.id;
end;
$$;

-- ---------- accept_draft with changes ----------
-- Applies the whole draft in one step (R1, R4) and remembers how to undo it. Our server first runs
-- R23's checks again against the calendar as it is now (times, the 14 days, overlaps, not started);
-- this function checks again what the database can:
--   * the draft is the user's and still open, under a row lock (two devices take turns);
--   * each new event lasts 15 minutes to 8 hours, its goal is the user's (the events' two-column link);
--   * each change is well formed and names one of the user's own events, at most once, that is timed,
--     not from Outlook (R11) and not part of a series (R28), and still has the updated_at the draft
--     saw (R4), under a row lock;
--   * a move's new times obey the events' own checks (end after start, at most 24 hours).
-- Moves and deletes are the same statements edit_event and delete_event send, so the events' triggers
-- do the same: updated_at moves on, a deleted event that Outlook has is remembered for deletion there,
-- a moved one is sent again (R26). New events get source "assistant". Returns the new events' ids.
create function app.chat_apply_draft(p_draft_id uuid)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  draft record;
  change jsonb;
  target uuid;
  seen uuid[] := '{}';
  ev record;
  new_version timestamptz;
  moved jsonb := '[]'::jsonb;
  deleted jsonb := '[]'::jsonb;
  created jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select d.id, d.status, d.proposed_events, d.changes into draft
    from app.draft_plans d where d.id = p_draft_id and d.user_id = uid for update;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  if draft.status <> 'open' then
    raise exception 'This draft is no longer open' using errcode = '23514', constraint = 'draft_plans_status_forward';
  end if;

  if exists (
    select 1 from jsonb_array_elements(draft.proposed_events) x
     where (x.value ->> 'end_at')::timestamptz - (x.value ->> 'start_at')::timestamptz
           not between interval '15 minutes' and interval '8 hours'
  ) then
    raise exception 'A proposed event must last 15 minutes to 8 hours' using errcode = '23514', constraint = 'draft_plans_event_length';
  end if;

  for change in select x.value from jsonb_array_elements(draft.changes) with ordinality as x(value, n) order by x.n loop
    if jsonb_typeof(change) <> 'object'
       or (change ->> 'kind') is null or (change ->> 'kind') not in ('move', 'delete')
       or (change ->> 'event_id') is null or (change ->> 'updated_at') is null
       or ((change ->> 'kind') = 'move' and ((change ->> 'start_at') is null or (change ->> 'end_at') is null)) then
      raise exception 'A change of the draft is malformed' using errcode = '23514', constraint = 'draft_plans_change_shape';
    end if;
    target := (change ->> 'event_id')::uuid;
    if target = any (seen) then
      raise exception 'A draft changes an event at most once' using errcode = '23514', constraint = 'draft_plans_change_once';
    end if;
    seen := seen || target;

    select e.id, e.title, e.all_day, e.start_at, e.end_at, e.may_overlap, e.status, e.goal_id, e.series_id,
           e.source, e.location, e.demo, e.updated_at
      into ev
      from app.events e where e.id = target and e.user_id = uid for update;
    if not found or ev.updated_at <> (change ->> 'updated_at')::timestamptz then
      raise exception 'This draft is out of date. Ask again' using errcode = '23514', constraint = 'draft_plans_out_of_date';
    end if;
    if ev.source = 'outlook' or ev.all_day or ev.series_id is not null then
      raise exception 'The coach cannot change this event' using errcode = '23514', constraint = 'draft_plans_change_not_allowed';
    end if;

    if (change ->> 'kind') = 'move' then
      update app.events
         set start_at = (change ->> 'start_at')::timestamptz, end_at = (change ->> 'end_at')::timestamptz
       where id = target
      returning updated_at into new_version;
      moved := moved || jsonb_build_array(jsonb_build_object(
        'id', target, 'updated_at', new_version, 'old_start_at', ev.start_at, 'old_end_at', ev.end_at));
    else
      deleted := deleted || jsonb_build_array(jsonb_build_object(
        'title', ev.title, 'start_at', ev.start_at, 'end_at', ev.end_at, 'may_overlap', ev.may_overlap,
        'status', ev.status, 'goal_id', ev.goal_id, 'source', ev.source, 'location', ev.location, 'demo', ev.demo));
      delete from app.events where id = target;
    end if;
  end loop;

  with inserted as (
    insert into app.events (user_id, source, title, all_day, start_at, end_at, goal_id, may_overlap)
    select uid, 'assistant', x.value ->> 'title', false,
           (x.value ->> 'start_at')::timestamptz, (x.value ->> 'end_at')::timestamptz,
           nullif(x.value ->> 'goal_id', '')::uuid, false
      from jsonb_array_elements(draft.proposed_events) with ordinality as x(value, n)
     order by x.n
    returning id, updated_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'updated_at', i.updated_at)), '[]'::jsonb) into created from inserted i;

  update app.draft_plans
     set status = 'accepted',
         undo = jsonb_build_object('created', created, 'moved', moved, 'deleted', deleted)
   where id = draft.id;

  return query select (c.value ->> 'id')::uuid from jsonb_array_elements(created) c;
end;
$$;

revoke all on function app.chat_apply_draft(uuid) from public, anon;
grant execute on function app.chat_apply_draft(uuid) to authenticated;

-- ---------- undo_draft ----------
-- Puts the calendar back as it was before the draft was applied, in one step (R1): deletes the events
-- it created, moves the moved ones back, and creates the deleted ones again with their fields (a new
-- id; a done event is done again, as the calendar's own undo does, R38; a goal deleted since is left
-- out). Allowed only while the draft is "accepted" and every event it created or moved still has the
-- updated_at it had right after applying (R4), checked under row locks; otherwise "This can no longer
-- be undone". Everything it writes comes from the undo data that app.chat_apply_draft took from the
-- rows themselves. The draft becomes "undone", a final status.
create function app.chat_undo_draft(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  draft record;
  item jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select d.id, d.status, d.undo into draft
    from app.draft_plans d where d.id = p_draft_id and d.user_id = uid for update;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  if draft.status <> 'accepted' or draft.undo is null then
    raise exception 'This can no longer be undone' using errcode = '23514', constraint = 'draft_plans_undo';
  end if;

  for item in
    select x.value from jsonb_array_elements(draft.undo -> 'created') x
    union all
    select x.value from jsonb_array_elements(draft.undo -> 'moved') x
  loop
    perform 1 from app.events e
     where e.id = (item ->> 'id')::uuid and e.user_id = uid and e.updated_at = (item ->> 'updated_at')::timestamptz
       for update;
    if not found then
      raise exception 'This can no longer be undone' using errcode = '23514', constraint = 'draft_plans_undo';
    end if;
  end loop;

  delete from app.events e
   where e.user_id = uid
     and e.id in (select (x.value ->> 'id')::uuid from jsonb_array_elements(draft.undo -> 'created') x);

  update app.events e
     set start_at = (x.value ->> 'old_start_at')::timestamptz, end_at = (x.value ->> 'old_end_at')::timestamptz
    from jsonb_array_elements(draft.undo -> 'moved') x
   where e.user_id = uid and e.id = (x.value ->> 'id')::uuid;

  insert into app.events (user_id, source, title, all_day, start_at, end_at, may_overlap, status, goal_id, location, demo)
  select uid, x.value ->> 'source', x.value ->> 'title', false,
         (x.value ->> 'start_at')::timestamptz, (x.value ->> 'end_at')::timestamptz,
         (x.value ->> 'may_overlap')::boolean, x.value ->> 'status',
         (select g.id from app.goals g where g.id = nullif(x.value ->> 'goal_id', '')::uuid and g.user_id = uid),
         x.value ->> 'location', coalesce((x.value ->> 'demo')::boolean, false)
    from jsonb_array_elements(draft.undo -> 'deleted') with ordinality as x(value, n)
   order by x.n;

  update app.draft_plans set status = 'undone' where id = draft.id;
end;
$$;

revoke all on function app.chat_undo_draft(uuid) from public, anon;
grant execute on function app.chat_undo_draft(uuid) to authenticated;
