-- The coach, step F: a draft adds to-dos to events that are already in the calendar (spec 23).
-- Run once in the Supabase SQL editor after the draft edits file.
--
-- Additive: the main branch and the branches 19-coach, 20-coach-changes, 21-event-todos and
-- 22-draft-drag run against the same database and keep working unchanged. One new column with a
-- default; the only loosened limit is the draft's "1 to 30 things", which now also counts the new kind;
-- one new function. Three functions the earlier code calls are replaced by versions that do everything
-- they did before:
--   * app.chat_accept_draft (19-coach) and app.chat_apply_draft (20 to 22) refuse a draft that adds
--     to-dos to existing events ("This draft is out of date. Ask again"), so the earlier code, which
--     does not know this kind, cannot apply such a draft while dropping its to-dos. Every draft the
--     earlier code writes has none, and for it both do exactly what they did.
--   * app.chat_undo_draft also removes the to-dos a draft added; undo data written before this file
--     has none, and for it nothing changes.
--
-- Security model, as in the earlier chat files: our server runs as the role "authenticated" with the
-- signed-in user's id. The user's role may write the new column only when it adds the draft
-- (send_message), never change it afterwards (no update right, and a trigger refuses any change); it
-- still may not write the undo data. Applying runs in the security definer function
-- app.chat_apply_draft_todos, which works on auth.uid()'s own rows only: each event must be the user's,
-- not from Outlook and have room for the new to-dos, checked under the event's row lock; otherwise
-- "This draft is out of date". The ids of the to-dos it writes go into the undo data from the rows
-- themselves, so undo removes exactly those and nothing the user's role could name.

-- ---------- Drafts: to-dos for existing events ----------
-- added_todos: a list of
--   { "event_id", "title", "all_day", "start_at", "end_at", "first_day", "last_day" (the event as the
--     draft saw it, for showing the draft later), "todos": ["title", …] (1 to 20, added at the end of
--     the event's list) }.
-- undo gets one more key when such a draft is applied: "todos": [the ids of the to-dos it wrote].
alter table app.draft_plans
  add column added_todos jsonb not null default '[]'::jsonb;

alter table app.draft_plans
  add constraint draft_plans_added_todos_list check (jsonb_typeof(added_todos) = 'array');

-- Loosened: 1 to 30 things in all, now new events, changes and to-dos for existing events together.
-- Same name as before, so a refusal reads the same. For every draft the earlier code writes
-- (added_todos empty) it decides exactly as before.
alter table app.draft_plans drop constraint draft_plans_events_list;
alter table app.draft_plans add constraint draft_plans_events_list check (
  case
    when jsonb_typeof(proposed_events) = 'array' and jsonb_typeof(changes) = 'array' and jsonb_typeof(added_todos) = 'array'
      then jsonb_array_length(proposed_events) + jsonb_array_length(changes) + jsonb_array_length(added_todos) between 1 and 30
    else false
  end
);

-- The user's role adds the draft's to-dos for existing events together with the rest of the draft
-- (send_message); it gets no right to change them.
grant insert (added_todos) on app.draft_plans to authenticated;

-- The to-dos for existing events never change once the draft is written (dragging changes only times,
-- spec 22). Nobody's code updates them; this refuses it even for a role that could.
create function app.check_draft_added_todos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.added_todos is distinct from old.added_todos then
    raise exception 'A draft''s to-dos for existing events do not change' using errcode = '23514', constraint = 'draft_plans_added_todos_fixed';
  end if;
  return new;
end;
$$;

revoke all on function app.check_draft_added_todos() from public, anon, authenticated;

create trigger check_draft_added_todos
  before update of added_todos on app.draft_plans
  for each row execute function app.check_draft_added_todos();

-- ---------- The old accept function (spec 19) ----------
-- As in the event to-dos file, and one refusal more: a draft that adds to-dos to existing events.
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

  select d.id, d.status, d.proposed_events, d.changes, d.added_todos into draft
    from app.draft_plans d where d.id = p_draft_id and d.user_id = uid for update;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  if draft.status <> 'open' then
    raise exception 'This draft is no longer open' using errcode = '23514', constraint = 'draft_plans_status_forward';
  end if;
  if jsonb_array_length(draft.changes) > 0
     or jsonb_array_length(draft.added_todos) > 0
     or exists (
       select 1 from jsonb_array_elements(draft.proposed_events) x
        where jsonb_typeof(x.value -> 'todos') = 'array' and jsonb_array_length(x.value -> 'todos') > 0
     ) then
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

-- ---------- accept_draft with to-dos for existing events ----------
-- Everything app.chat_apply_draft of the event to-dos file does (new events with their to-dos, moves,
-- deletes, the undo data), in one step, and then for each entry of added_todos:
--   * the entry is well formed: an object with an event id and 1 to 20 texts; each event at most once;
--   * the event is the user's, still there (not deleted by this draft or since) and not from Outlook
--     (R11), under its row lock (an add_todo at the same moment waits); it need not be unchanged;
--   * its to-dos now plus the new ones are at most 20;
--   * the new to-dos go to the end of its list, in the draft's order, not done; the table checks each
--     title (1 to 100 characters, no spaces around it) and the limit again.
-- Any failure of the event: "This draft is out of date. Ask again", and nothing is saved (R1).
-- The ids of the new to-dos are kept in the undo data ("todos"). Returns the new events' ids.
create function app.chat_apply_draft_todos(p_draft_id uuid)
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
  created jsonb := '[]'::jsonb;
  proposal jsonb;
  new_id uuid;
  addition jsonb;
  with_todos uuid[] := '{}';
  ev_source text;
  have integer;
  next_place integer;
  added_ids jsonb := '[]'::jsonb;
  written jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select d.id, d.status, d.proposed_events, d.changes, d.added_todos into draft
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

  if exists (
    select 1 from jsonb_array_elements(draft.proposed_events) x
     where x.value ? 'todos'
       and (jsonb_typeof(x.value -> 'todos') <> 'array'
            or exists (select 1 from jsonb_array_elements(x.value -> 'todos') t where jsonb_typeof(t.value) <> 'string'))
  ) then
    raise exception 'A to-do of the draft is malformed' using errcode = '23514', constraint = 'draft_plans_todo_shape';
  end if;

  -- The to-dos for existing events, checked for their shape before anything is written.
  -- One case after the other, so a missing key counts as malformed and a list's length is read only
  -- from a list.
  if exists (
    select 1 from jsonb_array_elements(draft.added_todos) x
     where case
             when jsonb_typeof(x.value) is distinct from 'object' then true
             when jsonb_typeof(x.value -> 'event_id') is distinct from 'string' then true
             when (x.value ->> 'event_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
             when jsonb_typeof(x.value -> 'todos') is distinct from 'array' then true
             when jsonb_array_length(x.value -> 'todos') not between 1 and 20 then true
             else exists (select 1 from jsonb_array_elements(x.value -> 'todos') t where jsonb_typeof(t.value) <> 'string')
           end
  ) then
    raise exception 'A to-do of the draft is malformed' using errcode = '23514', constraint = 'draft_plans_todo_shape';
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
        'status', ev.status, 'goal_id', ev.goal_id, 'source', ev.source, 'location', ev.location, 'demo', ev.demo,
        'todos', coalesce(
          (select jsonb_agg(jsonb_build_object('title', t.title, 'done', t.done) order by t.position)
             from app.event_todos t where t.event_id = target and t.user_id = uid),
          '[]'::jsonb)));
      delete from app.events where id = target;
    end if;
  end loop;

  for proposal in select x.value from jsonb_array_elements(draft.proposed_events) with ordinality as x(value, n) order by x.n loop
    insert into app.events (user_id, source, title, all_day, start_at, end_at, goal_id, may_overlap)
    values (uid, 'assistant', proposal ->> 'title', false,
            (proposal ->> 'start_at')::timestamptz, (proposal ->> 'end_at')::timestamptz,
            nullif(proposal ->> 'goal_id', '')::uuid, false)
    returning id, updated_at into new_id, new_version;
    insert into app.event_todos (user_id, event_id, title, position)
    select uid, new_id, t.value #>> '{}', (t.n - 1)::integer
      from jsonb_array_elements(coalesce(proposal -> 'todos', '[]'::jsonb)) with ordinality as t(value, n)
     order by t.n;
    created := created || jsonb_build_array(jsonb_build_object('id', new_id, 'updated_at', new_version));
  end loop;

  -- Spec 23: the to-dos for existing events, after the moves and deletes (an event this draft deleted
  -- is gone, so it gets nothing).
  for addition in select x.value from jsonb_array_elements(draft.added_todos) with ordinality as x(value, n) order by x.n loop
    target := (addition ->> 'event_id')::uuid;
    if target = any (with_todos) then
      raise exception 'A draft adds to-dos to an event at most once' using errcode = '23514', constraint = 'draft_plans_todos_once';
    end if;
    with_todos := with_todos || target;

    select e.source into ev_source from app.events e where e.id = target and e.user_id = uid for update;
    if not found or ev_source = 'outlook' then
      raise exception 'This draft is out of date. Ask again' using errcode = '23514', constraint = 'draft_plans_out_of_date';
    end if;
    -- The same lock the to-dos' own trigger takes, so the count below is the list as it is.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('event_todos:' || target::text));
    select count(*)::integer, coalesce(max(t.position) + 1, 0) into have, next_place
      from app.event_todos t where t.event_id = target and t.user_id = uid;
    if have + jsonb_array_length(addition -> 'todos') > 20 then
      raise exception 'This draft is out of date. Ask again' using errcode = '23514', constraint = 'draft_plans_out_of_date';
    end if;

    with inserted as (
      insert into app.event_todos (user_id, event_id, title, position)
      select uid, target, t.value #>> '{}', next_place + (t.n - 1)::integer
        from jsonb_array_elements(addition -> 'todos') with ordinality as t(value, n)
       order by t.n
      returning id, position
    )
    select coalesce(jsonb_agg(to_jsonb(i.id) order by i.position), '[]'::jsonb) into written from inserted i;
    added_ids := added_ids || written;
  end loop;

  update app.draft_plans
     set status = 'accepted',
         undo = jsonb_build_object('created', created, 'moved', moved, 'deleted', deleted, 'todos', added_ids)
   where id = draft.id;

  return query select (c.value ->> 'id')::uuid from jsonb_array_elements(created) c;
end;
$$;

revoke all on function app.chat_apply_draft_todos(uuid) from public, anon;
grant execute on function app.chat_apply_draft_todos(uuid) to authenticated;

-- ---------- The accept function of specs 20 to 22 ----------
-- For every draft the earlier code writes (no to-dos for existing events) exactly what it did: the new
-- function above does the same and adds nothing. A draft that adds to-dos to existing events is
-- refused, so the earlier code cannot apply it while dropping those to-dos.
create or replace function app.chat_apply_draft(p_draft_id uuid)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  found_todos jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select d.added_todos into found_todos from app.draft_plans d where d.id = p_draft_id and d.user_id = uid;
  if found and jsonb_array_length(found_todos) > 0 then
    raise exception 'This draft is out of date. Ask again' using errcode = '23514', constraint = 'draft_plans_out_of_date';
  end if;

  return query select x.id from app.chat_apply_draft_todos(p_draft_id) as x(id);
end;
$$;

-- ---------- undo_draft ----------
-- Everything it did before, and first: removes exactly the to-dos the draft added to existing events
-- that still exist (also ticked or renamed ones; an event deleted since took its to-dos with it and is
-- no obstacle), and closes the gaps in those events' lists. These to-dos never block undo; the other
-- rules stay (every event the draft created or moved unchanged since applying).
create or replace function app.chat_undo_draft(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  draft record;
  item jsonb;
  new_id uuid;
  touched uuid[];
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

  -- Spec 23: the to-dos it added to existing events, then the places of the rest without gaps.
  with removed as (
    delete from app.event_todos t
     where t.user_id = uid
       and t.id in (select (x.value #>> '{}')::uuid from jsonb_array_elements(coalesce(draft.undo -> 'todos', '[]'::jsonb)) x)
    returning t.event_id
  )
  select coalesce(array_agg(distinct r.event_id), '{}') into touched from removed r;
  update app.event_todos t
     set position = r.place
    from (
      select o.id, (row_number() over (partition by o.event_id order by o.position, o.id) - 1)::integer as place
        from app.event_todos o
       where o.user_id = uid and o.event_id = any (touched)
    ) r
   where t.id = r.id and t.position is distinct from r.place;

  delete from app.events e
   where e.user_id = uid
     and e.id in (select (x.value ->> 'id')::uuid from jsonb_array_elements(draft.undo -> 'created') x);

  update app.events e
     set start_at = (x.value ->> 'old_start_at')::timestamptz, end_at = (x.value ->> 'old_end_at')::timestamptz
    from jsonb_array_elements(draft.undo -> 'moved') x
   where e.user_id = uid and e.id = (x.value ->> 'id')::uuid;

  for item in select x.value from jsonb_array_elements(draft.undo -> 'deleted') with ordinality as x(value, n) order by x.n loop
    insert into app.events (user_id, source, title, all_day, start_at, end_at, may_overlap, status, goal_id, location, demo)
    values (uid, item ->> 'source', item ->> 'title', false,
            (item ->> 'start_at')::timestamptz, (item ->> 'end_at')::timestamptz,
            (item ->> 'may_overlap')::boolean, item ->> 'status',
            (select g.id from app.goals g where g.id = nullif(item ->> 'goal_id', '')::uuid and g.user_id = uid),
            item ->> 'location', coalesce((item ->> 'demo')::boolean, false))
    returning id into new_id;
    insert into app.event_todos (user_id, event_id, title, done, position)
    select uid, new_id, t.value ->> 'title', coalesce((t.value ->> 'done')::boolean, false), (t.n - 1)::integer
      from jsonb_array_elements(coalesce(item -> 'todos', '[]'::jsonb)) with ordinality as t(value, n)
     order by t.n;
  end loop;

  update app.draft_plans set status = 'undone' where id = draft.id;
end;
$$;
