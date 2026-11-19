-- An accepted invitation shows the event almost like one of the user's own (spec 55, branch
-- 60-accepted-invite-details; asked for by the owner on 19 Nov 2026). Run once in the Supabase SQL editor
-- after 20261210000000_event_invites.sql. Not applied to the live database by the agent that wrote it.
--
-- Additive only: the code on main runs against the same database and keeps working unchanged. Four new
-- columns on app.event_invites (empty or 'planned' for every existing row), their checks, one foreign
-- key, one index and new functions. Nothing existing is removed, renamed, made stricter or loosened; the
-- policies of app.events, app.event_todos and app.event_invites stay "own rows only".
--
-- What changes, and for whom (ontology R3 (5), R60, R63, R65 to R67):
-- * SHARED between the owner and every person who ACCEPTED the invitation (answer 'accepted'; not
--   'pending', 'tentative' or 'declined'): the event's to-dos (read, add, rename, tick, move, delete) and
--   its notes (read and change). They stay where they are: the to-dos in app.event_todos and the notes in
--   app.events.notes, both on the owner's rows (user_id = the owner), so the owner sees every change in
--   their own editor, as before. An invited person writes them only through the functions below.
-- * PERSONAL to the invited person, kept on their invitation row: a goal of their own (goal_id), how
--   they get there (travel_mode) and where their trip starts (travel_from), and whether they marked the
--   event done (status). The owner never reads these: the role "authenticated" gets no right on these
--   columns, and no function hands them to anyone but the invited person.
-- * Never written by an invited person: the event's title, times, days, place, goal, travel mode,
--   travel_from, status, guests or anything else of the owner's row except the notes (R63).
--
-- Every function is security definer with an empty search path, refuses a missing auth.uid(), and finds
-- the invitation only when it is the caller's own AND accepted; anything else (a pending, maybe or
-- declined invitation, someone else's, a missing or a malformed one) is "Not found", the same in each
-- case (R64). A to-do is found only when it belongs to the invitation's event. Writes are single
-- statements; the to-do limit of 20 is still checked by the table's own trigger under its lock.
--
-- The file runs as one transaction (begin ... commit) so that it is all or nothing in any SQL editor.

begin;

-- ---------- The invited person's own columns ----------

-- goal_id: one of the invited person's OWN goals (the pair (invitee, goal_id) points at app.goals, so it
--   can never be someone else's); deleting the goal empties it. travel_mode and travel_from: the same
--   values as on app.events (R27). status: 'done' once the invited person marked the event done.
alter table app.event_invites
  add column goal_id uuid,
  add column travel_mode text,
  add column travel_from text,
  add column status text not null default 'planned',
  add constraint event_invites_goal_of_invitee foreign key (invitee, goal_id)
    references app.goals (user_id, id) on delete set null (goal_id),
  add constraint event_invites_travel_mode check (travel_mode is null or travel_mode in ('driving', 'cycling', 'walking', 'transit')),
  add constraint event_invites_travel_from_form check (
    travel_from is null
    or travel_from in ('home', 'last')
    or travel_from ~ '^place:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (travel_from like 'address:%' and char_length(travel_from) between 9 and 308)
  ),
  add constraint event_invites_status check (status in ('planned', 'done'));

create index event_invites_invitee_goal on app.event_invites (invitee, goal_id);

-- The owner can read their invitation rows through the table (20261210000000_event_invites.sql grants a
-- few columns); the new columns are the invited person's own, so nobody reads them through the table.
-- They were never granted; this says it once more, in case a default privilege handed them out.
revoke select (goal_id, travel_mode, travel_from, status), update (goal_id, travel_mode, travel_from, status)
  on app.event_invites from public, anon, authenticated;

-- ---------- Helper (internal) ----------

-- The caller's own ACCEPTED invitation with this id, or "Not found". Internal: only the functions below
-- call it.
create function app.accepted_invite_row(p_invite uuid)
returns app.event_invites
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_row app.event_invites;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_row from app.event_invites i
   where i.id = p_invite and i.invitee = uid and i.answer = 'accepted';
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

revoke all on function app.accepted_invite_row(uuid) from public, anon, authenticated;

-- ---------- Reading ----------

-- The accepted invitation in the shape of R65: of the owner's event its title, times (or days and the
-- all-day mark), place and notes; of the invitation its id, answer, the owner's user id, and the invited
-- person's own goal, travel mode, travel_from and done mark. Never the event's id, its goal, travel mode,
-- travel_from, status, guests, source, series or updated_at.
create function app.accepted_invite_details(p_invite uuid)
returns table (
  invite_id uuid,
  answer text,
  owner_id uuid,
  title text,
  all_day boolean,
  start_at timestamptz,
  end_at timestamptz,
  first_day date,
  last_day date,
  location text,
  notes text,
  goal_id uuid,
  travel_mode text,
  travel_from text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv app.event_invites;
begin
  select * into v_inv from app.accepted_invite_row(p_invite);
  return query
    select v_inv.id, v_inv.answer, v_inv.owner, e.title, e.all_day, e.start_at, e.end_at, e.first_day, e.last_day,
           e.location, e.notes, v_inv.goal_id, v_inv.travel_mode, v_inv.travel_from, v_inv.status
      from app.events e
     where e.id = v_inv.event_id;
end;
$$;

revoke all on function app.accepted_invite_details(uuid) from public, anon;
grant execute on function app.accepted_invite_details(uuid) to authenticated;

-- The event's to-dos in their order (the same list the owner sees): id, title, done.
create function app.accepted_invite_todos(p_invite uuid)
returns table (id uuid, title text, done boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv app.event_invites;
begin
  select * into v_inv from app.accepted_invite_row(p_invite);
  return query
    select t.id, t.title, t.done from app.event_todos t
     where t.event_id = v_inv.event_id
     order by t.position, t.id;
end;
$$;

revoke all on function app.accepted_invite_todos(uuid) from public, anon;
grant execute on function app.accepted_invite_todos(uuid) to authenticated;

-- For the invited person's goal progress and analytics (R66): their accepted invitations to timed events
-- that have one of their goals, with the event's title and times and their own done mark. Nothing else.
create function app.accepted_invite_goal_events()
returns table (invite_id uuid, goal_id uuid, title text, start_at timestamptz, end_at timestamptz, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.goal_id, e.title, e.start_at, e.end_at, i.status
    from app.event_invites i
    join app.events e on e.id = i.event_id
   where (select auth.uid()) is not null
     and i.invitee = (select auth.uid())
     and i.answer = 'accepted'
     and i.goal_id is not null
     and not e.all_day
   order by e.start_at, i.id;
$$;

revoke all on function app.accepted_invite_goal_events() from public, anon;
grant execute on function app.accepted_invite_goal_events() to authenticated;

-- ---------- The shared to-dos ----------

-- Adds a to-do at the end of the event's list, on the owner's row (user_id = the owner), so the owner
-- sees it as one of their own. The title is trimmed and must be 1 to 100 characters; the table's trigger
-- checks the limit of 20 under its lock (two additions at the same moment take turns).
create function app.add_accepted_invite_todo(p_invite uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv app.event_invites;
  v_title text := pg_catalog.btrim(p_title);
  v_id uuid;
begin
  select * into v_inv from app.accepted_invite_row(p_invite);
  if v_title is null or pg_catalog.char_length(v_title) not between 1 and 100 then
    raise exception 'A to-do needs a title of 1 to 100 characters' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('event_todos:' || v_inv.event_id::text));
  insert into app.event_todos (user_id, event_id, title, position)
  values (v_inv.owner, v_inv.event_id, v_title,
          (select count(*)::integer from app.event_todos t where t.event_id = v_inv.event_id))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function app.add_accepted_invite_todo(uuid, text) from public, anon;
grant execute on function app.add_accepted_invite_todo(uuid, text) to authenticated;

-- A new title for one of the event's to-dos.
create function app.rename_accepted_invite_todo(p_invite uuid, p_todo uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv app.event_invites;
  v_title text := pg_catalog.btrim(p_title);
begin
  select * into v_inv from app.accepted_invite_row(p_invite);
  if not exists (select 1 from app.event_todos t where t.id = p_todo and t.event_id = v_inv.event_id) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) not between 1 and 100 then
    raise exception 'A to-do needs a title of 1 to 100 characters' using errcode = '22023';
  end if;
  update app.event_todos t set title = v_title where t.id = p_todo and t.event_id = v_inv.event_id;
end;
$$;

revoke all on function app.rename_accepted_invite_todo(uuid, uuid, text) from public, anon;
grant execute on function app.rename_accepted_invite_todo(uuid, uuid, text) to authenticated;

-- Done or not done again.
create function app.tick_accepted_invite_todo(p_invite uuid, p_todo uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv app.event_invites;
begin
  select * into v_inv from app.accepted_invite_row(p_invite);
  if p_done is null then raise exception 'Invalid request.' using errcode = '22023'; end if;
  update app.event_todos t set done = p_done where t.id = p_todo and t.event_id = v_inv.event_id;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function app.tick_accepted_invite_todo(uuid, uuid, boolean) from public, anon;
grant execute on function app.tick_accepted_invite_todo(uuid, uuid, boolean) to authenticated;

-- To another place in the list (counted from 0; a place past the end is the end); the others close up.
-- One statement renumbers the whole list, so "one to-do per place" holds at its end.
create function app.move_accepted_invite_todo(p_invite uuid, p_todo uuid, p_to integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv app.event_invites;
  v_ids uuid[];
  v_at integer;
begin
  select * into v_inv from app.accepted_invite_row(p_invite);
  if not exists (select 1 from app.event_todos t where t.id = p_todo and t.event_id = v_inv.event_id) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if p_to is null or p_to < 0 then raise exception 'Invalid request.' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('event_todos:' || v_inv.event_id::text));
  select coalesce(pg_catalog.array_agg(t.id order by t.position, t.id), '{}'::uuid[]) into v_ids
    from app.event_todos t where t.event_id = v_inv.event_id and t.id <> p_todo;
  v_at := least(p_to, pg_catalog.cardinality(v_ids));
  v_ids := v_ids[1:v_at] || p_todo || v_ids[v_at + 1:pg_catalog.cardinality(v_ids)];
  update app.event_todos t set position = (o.n - 1)::integer
    from pg_catalog.unnest(v_ids) with ordinality as o(id, n)
   where t.id = o.id and t.event_id = v_inv.event_id and t.position is distinct from (o.n - 1)::integer;
end;
$$;

revoke all on function app.move_accepted_invite_todo(uuid, uuid, integer) from public, anon;
grant execute on function app.move_accepted_invite_todo(uuid, uuid, integer) to authenticated;

-- Deletes one of the event's to-dos; the later ones move up.
create function app.delete_accepted_invite_todo(p_invite uuid, p_todo uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv app.event_invites;
begin
  select * into v_inv from app.accepted_invite_row(p_invite);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('event_todos:' || v_inv.event_id::text));
  delete from app.event_todos t where t.id = p_todo and t.event_id = v_inv.event_id;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  update app.event_todos t set position = (o.n - 1)::integer
    from (select t2.id, pg_catalog.row_number() over (order by t2.position, t2.id) as n
            from app.event_todos t2 where t2.event_id = v_inv.event_id) o
   where t.id = o.id and t.position is distinct from (o.n - 1)::integer;
end;
$$;

revoke all on function app.delete_accepted_invite_todo(uuid, uuid) from public, anon;
grant execute on function app.delete_accepted_invite_todo(uuid, uuid) to authenticated;

-- ---------- The shared notes ----------

-- Writes the notes of the owner's event (only that column). p_before is the text the invited person last
-- read: when the notes changed since (the owner or another invited person wrote first), nothing is
-- written and the answer says so, so nobody overwrites what they have not seen. An empty text removes the
-- notes. The table's checks keep the length (1 to 2,000 characters) and refuse spaces at the end. Like
-- every change of the event's row, it gives the event a new updated_at, so an editor of the owner that
-- still shows the old notes is told "Changed on another device" instead of writing over them (R4).
create function app.set_accepted_invite_notes(p_invite uuid, p_notes text, p_before text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv app.event_invites;
begin
  select * into v_inv from app.accepted_invite_row(p_invite);
  update app.events e
     set notes = nullif(p_notes, '')
   where e.id = v_inv.event_id
     and e.notes is not distinct from nullif(p_before, '');
  if not found then
    raise exception 'The notes were changed meanwhile. Reload to see the latest version' using errcode = '40001';
  end if;
end;
$$;

revoke all on function app.set_accepted_invite_notes(uuid, text, text) from public, anon;
grant execute on function app.set_accepted_invite_notes(uuid, text, text) to authenticated;

-- ---------- The invited person's own choices ----------

-- The goal (one of the caller's own goals, or none), the travel mode and where the trip starts (null:
-- the standard), all three at once. An all-day event has no goal (R29). Another user's goal is "Not
-- found", like a missing one. Written only on the invitation row; the owner's event stays as it is.
create function app.set_accepted_invite_personal(p_invite uuid, p_goal uuid, p_travel_mode text, p_travel_from text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_inv app.event_invites;
  v_all_day boolean;
begin
  select * into v_inv from app.accepted_invite_row(p_invite);
  if p_goal is not null then
    select e.all_day into v_all_day from app.events e where e.id = v_inv.event_id;
    if v_all_day then
      raise exception 'All-day events have no goal' using errcode = '22023';
    end if;
    if not exists (select 1 from app.goals g where g.id = p_goal and g.user_id = uid) then
      raise exception 'Not found' using errcode = 'P0002';
    end if;
  end if;
  update app.event_invites i
     set goal_id = p_goal, travel_mode = p_travel_mode, travel_from = p_travel_from
   where i.id = v_inv.id;
end;
$$;

revoke all on function app.set_accepted_invite_personal(uuid, uuid, text, text) from public, anon;
grant execute on function app.set_accepted_invite_personal(uuid, uuid, text, text) to authenticated;

-- The invited person marks the event done for themselves (or planned again), as mark_event_done does for
-- an own event: only a timed event that has started can be done. The owner's own status stays.
create function app.set_accepted_invite_done(p_invite uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv app.event_invites;
  v_all_day boolean;
  v_start timestamptz;
begin
  select * into v_inv from app.accepted_invite_row(p_invite);
  if p_done is null then raise exception 'Invalid request.' using errcode = '22023'; end if;
  if p_done then
    select e.all_day, e.start_at into v_all_day, v_start from app.events e where e.id = v_inv.event_id;
    if v_all_day then
      raise exception 'All-day events cannot be marked done' using errcode = '22023';
    end if;
    if v_start > pg_catalog.now() then
      raise exception 'You can mark an event done once it has started' using errcode = '22023';
    end if;
  end if;
  update app.event_invites i
     set status = case when p_done then 'done' else 'planned' end
   where i.id = v_inv.id;
end;
$$;

revoke all on function app.set_accepted_invite_done(uuid, boolean) from public, anon;
grant execute on function app.set_accepted_invite_done(uuid, boolean) to authenticated;

commit;
