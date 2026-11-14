-- Notes inside an event (issue #5, spec 27; added 14 November 2026). Run once in the Supabase SQL editor
-- after 20261201000001_undo_keeps_travel_mode.sql.
--
-- Additive only: the code on main runs against the same database and must keep working unchanged.
-- One new column on app.events (empty for every existing row), its checks, one column right, and new
-- versions of the coach's accept and undo functions that also keep a deleted event's notes.
--
-- notes: the user's own text about an event, null or 1 to 2,000 characters (characters, not bytes: the
--   same count as the editor's and the server's check), without whitespace at the end (the server trims
--   it; an empty note is saved as null). Notes stay in the app: they are never sent to Outlook (R26) or
--   to Claude (R22). An Outlook event has none (R11): the check below refuses them, and R11's trigger
--   (app.keep_outlook_events) refuses any change of an Outlook event's row by the user.

alter table app.events
  add column notes text;

alter table app.events
  add constraint events_notes_length check (
    notes is null or (pg_catalog.char_length(notes) between 1 and 2000 and notes !~ '[ \t\n\r\f\v]$')
  ),
  add constraint events_notes_not_outlook check (notes is null or source <> 'outlook');

-- The user may write the notes of their own events when creating and editing them (row-level security
-- limits the rows; R11's trigger refuses Outlook events). Unlike the location, no narrow function is
-- needed: the trigger and the check above already keep notes off Outlook events.
grant insert (notes), update (notes) on app.events to authenticated;

-- The coach's accept and undo (R38's undo of a delete is create_event with the notes, in the code).
-- Both functions are replaced with their newest definitions (from 20261201000001_undo_keeps_travel_mode.sql;
-- no later migration replaced them) plus the notes in the snapshot of a deleted event and in its
-- re-insert. Undo data written before this migration has no notes and still restores, with null.
-- Same names, arguments, return values and rights: the code on main keeps working unchanged (it
-- ignores the extra key in the undo data).

-- ---------- accept: the snapshot of a deleted event now includes its notes ----------
create or replace function app.chat_apply_draft_todos(p_draft_id uuid)
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
           e.source, e.location, e.demo, e.travel_mode, e.notes, e.updated_at
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
        'travel_mode', ev.travel_mode,
        'notes', ev.notes,
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

-- ---------- undo_draft: a deleted event comes back with its notes ----------
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
    insert into app.events (user_id, source, title, all_day, start_at, end_at, may_overlap, status, goal_id, location, demo, travel_mode, notes)
    values (uid, item ->> 'source', item ->> 'title', false,
            (item ->> 'start_at')::timestamptz, (item ->> 'end_at')::timestamptz,
            (item ->> 'may_overlap')::boolean, item ->> 'status',
            (select g.id from app.goals g where g.id = nullif(item ->> 'goal_id', '')::uuid and g.user_id = uid),
            item ->> 'location', coalesce((item ->> 'demo')::boolean, false),
            -- A snapshot taken before this migration has no travel mode: null, "use my standard".
            item ->> 'travel_mode',
            -- A snapshot taken before the notes migration has no notes: null.
            item ->> 'notes')
    returning id into new_id;
    insert into app.event_todos (user_id, event_id, title, done, position)
    select uid, new_id, t.value ->> 'title', coalesce((t.value ->> 'done')::boolean, false), (t.n - 1)::integer
      from jsonb_array_elements(coalesce(item -> 'todos', '[]'::jsonb)) with ordinality as t(value, n)
     order by t.n;
  end loop;

  update app.draft_plans set status = 'undone' where id = draft.id;
end;
$$;

revoke all on function app.chat_undo_draft(uuid) from public, anon;
grant execute on function app.chat_undo_draft(uuid) to authenticated;
