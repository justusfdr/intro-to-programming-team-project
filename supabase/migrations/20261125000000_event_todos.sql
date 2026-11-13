-- To-dos inside an event (spec 21; ontology change of 13 Nov 2026 on the branch 21-event-todos).
-- Run once in the Supabase SQL editor after the coach changes file.
--
-- Additive: the main branch and the branches 19-coach and 20-coach-changes run against the same
-- database and keep working unchanged. One new table; the two coach functions of spec 20 are replaced
-- by versions that do everything they did before and also carry to-dos (a draft's new events may have
-- to-dos; an event the coach deletes keeps its to-dos for undo). The old accept function of spec 19
-- gets one refusal more, for drafts only the new code writes (a new event with to-dos), so it cannot
-- accept such a draft while dropping its to-dos.
--
-- Security model, as everywhere: our server runs every query as the role "authenticated" with the
-- signed-in user's id, so row-level security limits it to the user's own rows (R3).
--
-- A to-do belongs to exactly one event of the same user, through the pair (user_id, event_id), and is
-- deleted with it. At most 20 per event, never on an Outlook event (R11), checked by a trigger that
-- two requests at the same moment cannot race. A change of a to-do does not change the event's
-- updated_at, so ticking a to-do never makes the event editor's Save look "changed on another device".

create table app.event_todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id uuid not null,
  title text not null,
  done boolean not null default false,
  -- The place in the event's list: 0, 1, 2, … Our server keeps the numbers without gaps.
  position integer not null,
  created_at timestamptz not null default now(),

  -- The event is the same user's; deleting the event deletes its to-dos.
  constraint event_todos_event_of_same_user foreign key (user_id, event_id)
    references app.events (user_id, id) on delete cascade,
  -- 1 to 100 characters, without spaces around it (the server trims).
  constraint event_todos_title_length check (char_length(title) between 1 and 100 and title = btrim(title)),
  constraint event_todos_position check (position >= 0),
  -- One to-do per place. Checked at the end of each statement, so one statement can swap two places.
  constraint event_todos_one_per_position unique (event_id, position) deferrable initially immediate
);

-- R11 and the limit of 20. The lock makes two requests for the same event at the same moment take
-- turns, so the second one sees the first one's to-do. Rows added earlier by the same statement count
-- too (a list written in one statement).
create function app.check_event_todos()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  found_source text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('event_todos:' || new.event_id::text));
  select e.source into found_source from app.events e where e.id = new.event_id and e.user_id = new.user_id;
  if found_source = 'outlook' then
    raise exception 'To-dos cannot be added to Outlook events' using errcode = '23514', constraint = 'event_todos_not_outlook';
  end if;
  if (select count(*) from app.event_todos t where t.event_id = new.event_id) >= 20 then
    raise exception 'An event can have at most 20 to-dos' using errcode = '23514', constraint = 'event_todos_at_most_20';
  end if;
  return new;
end;
$$;

revoke all on function app.check_event_todos() from public, anon, authenticated;

create trigger event_todos_check
  before insert on app.event_todos
  for each row execute function app.check_event_todos();

-- Rights: only the role "authenticated", and only these columns. A to-do never moves to another
-- event (event_id is not updatable).
revoke all on app.event_todos from public, anon, authenticated;
grant select, delete on app.event_todos to authenticated;
grant insert (event_id, title, done, position) on app.event_todos to authenticated;
grant update (title, done, position) on app.event_todos to authenticated;
-- Not writable by users: id, user_id, created_at; event_id only when the to-do is added.

-- Row-level security: each user reads and changes only their own to-dos (R3).
alter table app.event_todos enable row level security;

create policy "Users read their own to-dos" on app.event_todos for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own to-dos" on app.event_todos for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users change their own to-dos" on app.event_todos for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their own to-dos" on app.event_todos for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- The coach (specs 19 and 20) ----------
-- A new event of a draft may carry to-dos: draft_plans.proposed_events items get an optional
-- "todos": ["title", …]. The user's role writes them with the draft, as it writes the rest of the draft
-- (no new right); the table above checks every title, the limit and R11 when they are written.

-- The old accept function (spec 19): unchanged for every draft the code of main and 19-coach writes.
-- A draft whose new events carry to-dos (only the new code writes those) is refused, so the old code
-- cannot accept it while dropping its to-dos; the new code uses app.chat_apply_draft.
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
  if jsonb_array_length(draft.changes) > 0
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

-- accept_draft with changes (spec 20), now also with to-dos: everything it did before, and
--   * each new event gets its to-dos, in the draft's order, in the same step; a to-do that is not a
--     text is refused, the table checks titles and the limit;
--   * an event it deletes keeps its to-dos (title, done, in order) in the undo data, so undo brings
--     them back with it.
create or replace function app.chat_apply_draft(p_draft_id uuid)
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

  if exists (
    select 1 from jsonb_array_elements(draft.proposed_events) x
     where x.value ? 'todos'
       and (jsonb_typeof(x.value -> 'todos') <> 'array'
            or exists (select 1 from jsonb_array_elements(x.value -> 'todos') t where jsonb_typeof(t.value) <> 'string'))
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

  update app.draft_plans
     set status = 'accepted',
         undo = jsonb_build_object('created', created, 'moved', moved, 'deleted', deleted)
   where id = draft.id;

  return query select (c.value ->> 'id')::uuid from jsonb_array_elements(created) c;
end;
$$;

-- undo_draft (spec 20), now also with to-dos: everything it did before; an event it creates again gets
-- back the to-dos the undo data kept (title and done, in order). The events it deletes (the ones the
-- draft created) take their to-dos with them. Undo data written before this file has no to-dos; such
-- an event comes back without any, as before.
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
