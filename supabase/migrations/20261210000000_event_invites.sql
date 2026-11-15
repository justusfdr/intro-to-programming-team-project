-- Inviting contacts to an event inside the app (spec 36, branch 37-event-invites). Run once in the
-- Supabase SQL editor after the earlier files (it needs 20261203000000_profiles_contacts.sql and
-- 20261205000000_shared_lists.sql, whose app.may_see_profile is replaced below).
--
-- Additive only: the code on main and on the other branches runs against the same database and must
-- keep working unchanged. One new table, one trigger on it, one new trigger on app.events (it writes
-- only the new table), new functions, and app.may_see_profile replaced with "create or replace": the same
-- signature, return type, security definer setting, empty search path and rights, its old conditions
-- word for word and two more (people of the same event invitation see each other's display name and
-- photo, so the avatars load). Nothing existing is removed, renamed, made stricter or loosened: the
-- policies of app.events and of every other table stay exactly as they are ("own rows only").
-- app.profile_card is NOT changed, so it never hands an e-mail address to a co-invited person.
--
-- What leaves the owner's rows, and to whom (ontology R59 to R64):
-- * To an invited person (always a contact of the owner, R59): of the one event they are invited to,
--   the title, the start and end (or the days and the all-day mark) and the place; who invited them (the
--   owner's user id; the name and photo through the profile functions); the other invited people and
--   their answers (user ids; names and photos through app.invite_person_names, never an e-mail address).
-- * Never: notes, to-dos, the goal, guests by e-mail, the organizer, travel mode, status, source, the
--   series, Outlook ids, updated_at, the event's id or any id other than the invitation's own.
-- Everything is read from the owner's row at the moment of the request; nothing is copied, so a change
-- by the owner shows at the next load and a deleted event or a removed contact shows nothing.
--
-- Every write goes through a narrow security definer function (empty search path, refuses a missing
-- auth.uid(), locks what it counts). The role "authenticated" cannot insert, update or delete the table.
--
-- The file runs as one transaction (begin ... commit) so that it is all or nothing in any SQL editor.

begin;

-- ---------- The table ----------

-- One row per event and invited person. It hangs on the event (deleting the event removes it), on the
-- contact row between owner and invitee (removing the contact, from either side, removes it) and on both
-- accounts. answer: 'pending' until the invited person answers; answered_at is set exactly when it is
-- not 'pending'.
create table app.event_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references app.events (id) on delete cascade,
  contact_id uuid not null references app.contacts (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  invitee uuid not null references auth.users (id) on delete cascade,
  answer text not null default 'pending',
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint event_invites_answer check (answer in ('pending', 'accepted', 'tentative', 'declined')),
  constraint event_invites_answered_at check ((answer = 'pending') = (answered_at is null)),
  constraint event_invites_once unique (event_id, invitee),
  constraint event_invites_not_self check (owner <> invitee)
);

create index event_invites_invitee on app.event_invites (invitee);
create index event_invites_owner on app.event_invites (owner);
create index event_invites_contact on app.event_invites (contact_id);

-- The two people of an invitation are always the two people of its contact row, the event is the
-- owner's own single event of the app or the coach (not from Outlook, not of a series, not a demo
-- event), and an event invites at most 20 people. Also for rows the table's owner writes by hand. Not
-- run again when only the answer changes.
create function app.check_event_invite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.contacts c
     where c.id = new.contact_id
       and c.user_a = least(new.owner, new.invitee)
       and c.user_b = greatest(new.owner, new.invitee)
  ) then
    raise exception 'An invitation belongs to the two people of its contact' using errcode = '23514';
  end if;
  if not exists (
    select 1 from app.events e
     where e.id = new.event_id
       and e.user_id = new.owner
       and e.source in ('app', 'assistant')
       and e.series_id is null
       and not e.demo
  ) then
    raise exception 'Only the owner''s own single event can invite people' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and (select count(*) from app.event_invites i where i.event_id = new.event_id) >= 20 then
    raise exception 'An event can invite at most 20 people' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app.check_event_invite() from public, anon, authenticated;

create trigger check_event_invite
  before insert or update of event_id, contact_id, owner, invitee on app.event_invites
  for each row execute function app.check_event_invite();

-- ---------- Rights and row-level security ----------

-- Take away the rights that default privileges may have handed out, then grant only reading, and only
-- of the columns that say nothing beyond the invitation itself: not event_id (an id of the owner's row)
-- and not contact_id. The owner reads the people of their events through app.event_invitees and
-- app.own_event_invitees; the invited person reads the event through app.invited_events.
revoke all on app.event_invites from public, anon, authenticated;
alter table app.event_invites enable row level security;

grant select (id, owner, invitee, answer, answered_at, created_at) on app.event_invites to authenticated;
create policy "Owner and invitee read an invitation" on app.event_invites
  for select to authenticated
  using (owner = (select auth.uid()) or invitee = (select auth.uid()));

-- No insert, update or delete for "authenticated": only the functions below write.

-- ---------- Helpers (internal) ----------

-- Whether an event has ended: a timed event at its end, an all-day event after its last day in the
-- owner's time zone (the days are the owner's). Null for a missing event. Internal.
create function app.event_has_ended(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when e.all_day then
      e.last_day < (pg_catalog.now() at time zone coalesce((select s.time_zone from app.settings s where s.user_id = e.user_id), 'Europe/Lisbon'))::date
    else e.end_at <= pg_catalog.now()
  end
    from app.events e
   where e.id = p_event;
$$;

revoke all on function app.event_has_ended(uuid) from public, anon, authenticated;

-- ---------- The owner sets the invited people ----------

-- The owner sets the list of invited contacts of one of their events (contact row ids). New ones are
-- added as 'pending', missing ones are removed, the others keep their answers. "Not found" for an event
-- that is not the caller's (foreign, missing) and for a contact row the caller is not part of, so
-- nobody can invite a stranger or go through someone else's contact. Inviting someone new needs a
-- single event of the app or the coach that has not ended (R59); taking people off is always possible
-- (only such events can have invitations at all). At most 20, counted under the event's lock.
create function app.set_event_invites(p_event uuid, p_contacts uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_event app.events%rowtype;
  v_wanted uuid[];
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_event from app.events e where e.id = p_event and e.user_id = uid for update;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if p_contacts is null or coalesce(pg_catalog.array_ndims(p_contacts), 1) <> 1 or pg_catalog.array_position(p_contacts, null) is not null then
    raise exception 'Invalid request.' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.array_agg(distinct w), '{}'::uuid[]) into v_wanted from pg_catalog.unnest(p_contacts) w;
  if exists (
    select 1 from pg_catalog.unnest(v_wanted) w
     where not exists (select 1 from app.contacts c where c.id = w and uid in (c.user_a, c.user_b))
  ) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(v_wanted) w
     where not exists (select 1 from app.event_invites i where i.event_id = p_event and i.contact_id = w)
  ) then
    if v_event.source = 'outlook' then
      raise exception 'Outlook events cannot invite people' using errcode = '22023';
    end if;
    if v_event.demo then
      raise exception 'Demo events cannot invite people' using errcode = '22023';
    end if;
    if v_event.series_id is not null then
      raise exception 'Events of a series cannot invite people' using errcode = '22023';
    end if;
    if app.event_has_ended(p_event) then
      raise exception 'People can only be invited to events that have not ended' using errcode = '22023';
    end if;
  end if;
  if pg_catalog.cardinality(v_wanted) > 20 then
    raise exception 'An event can invite at most 20 people' using errcode = '22023';
  end if;
  delete from app.event_invites i where i.event_id = p_event and not (i.contact_id = any (v_wanted));
  insert into app.event_invites (event_id, contact_id, owner, invitee)
  select p_event, c.id, uid, case when c.user_a = uid then c.user_b else c.user_a end
    from app.contacts c
   where c.id = any (v_wanted)
     and not exists (select 1 from app.event_invites i where i.event_id = p_event and i.contact_id = c.id)
   order by c.id;
end;
$$;

revoke all on function app.set_event_invites(uuid, uuid[]) from public, anon;
grant execute on function app.set_event_invites(uuid, uuid[]) to authenticated;

-- ---------- The invited person answers ----------

-- Only the invited person, only their own invitation, only while the event has not ended. "Not found"
-- for anything else (another person's invitation, a missing one), so nobody learns that it exists.
create function app.answer_event_invite(p_invite uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_event uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select i.event_id into v_event from app.event_invites i where i.id = p_invite and i.invitee = uid for update;
  if v_event is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if p_answer is null or p_answer not in ('accepted', 'tentative', 'declined') then
    raise exception 'Choose accept, maybe or decline' using errcode = '22023';
  end if;
  if app.event_has_ended(v_event) then
    raise exception 'This event has ended' using errcode = '22023';
  end if;
  update app.event_invites set answer = p_answer, answered_at = pg_catalog.clock_timestamp() where id = p_invite;
end;
$$;

revoke all on function app.answer_event_invite(uuid, text) from public, anon;
grant execute on function app.answer_event_invite(uuid, text) to authenticated;

-- ---------- What the invited person reads ----------

-- The events the signed-in user is invited to between p_from and p_to (at most 62 days), in the reduced
-- shape of R60: the invitation's id and answer, the owner's user id, and of the owner's event only the
-- title, the times (or the days and the all-day mark) and the place. Declined ones too (the screen
-- leaves them out of the grid but lists them).
create function app.invited_events(p_from timestamptz, p_to timestamptz)
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
  location text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '62 days' then
    raise exception 'Choose at most 62 days' using errcode = '22023';
  end if;
  return query
    select i.id, i.answer, i.owner, e.title, e.all_day, e.start_at, e.end_at, e.first_day, e.last_day, e.location
      from app.event_invites i
      join app.events e on e.id = i.event_id
     where i.invitee = uid
       and (
         (not e.all_day and e.start_at < p_to and e.end_at > p_from)
         or (e.all_day and e.first_day <= (p_to at time zone 'UTC')::date and e.last_day >= (p_from at time zone 'UTC')::date - 1)
       )
     order by e.all_day, e.start_at, e.first_day, i.id;
end;
$$;

revoke all on function app.invited_events(timestamptz, timestamptz) from public, anon;
grant execute on function app.invited_events(timestamptz, timestamptz) to authenticated;

-- The invitations still to look at, for the list behind the calendar's "invitations" button: those not
-- answered yet and those declined, of events that have not ended, soonest first, at most 100. The same
-- reduced shape as app.invited_events.
create function app.open_event_invites()
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
  location text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.answer, i.owner, e.title, e.all_day, e.start_at, e.end_at, e.first_day, e.last_day, e.location
    from app.event_invites i
    join app.events e on e.id = i.event_id
   where (select auth.uid()) is not null
     and i.invitee = (select auth.uid())
     and i.answer in ('pending', 'declined')
     and not app.event_has_ended(e.id)
   order by coalesce(e.start_at, e.first_day::timestamptz), i.id
   limit 100;
$$;

revoke all on function app.open_event_invites() from public, anon;
grant execute on function app.open_event_invites() to authenticated;

-- The number of invitations the signed-in user has not answered, of events that have not ended (the
-- badge on "Calendar").
create function app.pending_invite_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from app.event_invites i
   where (select auth.uid()) is not null
     and i.invitee = (select auth.uid())
     and i.answer = 'pending'
     and not app.event_has_ended(i.event_id);
$$;

revoke all on function app.pending_invite_count() from public, anon;
grant execute on function app.pending_invite_count() to authenticated;

-- ---------- The people of an event ----------

-- For the owner: the people invited to one of their events, with their answers, in the order they were
-- invited. "Not found" for an event that is not the caller's (the same for a missing one).
create function app.event_invitees(p_event uuid)
returns table (user_id uuid, answer text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from app.events e where e.id = p_event and e.user_id = uid) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return query
    select i.invitee, i.answer from app.event_invites i where i.event_id = p_event order by i.created_at, i.invitee;
end;
$$;

revoke all on function app.event_invitees(uuid) from public, anon;
grant execute on function app.event_invitees(uuid) to authenticated;

-- For the owner, several events at once (the calendar page's shown events): the invited people of each
-- of those events that is the caller's own. Other ids give no rows.
create function app.own_event_invitees(p_events uuid[])
returns table (event_id uuid, user_id uuid, answer text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.event_id, i.invitee, i.answer
    from app.event_invites i
   where (select auth.uid()) is not null
     and i.owner = (select auth.uid())
     and i.event_id = any (p_events)
   order by i.event_id, i.created_at, i.invitee;
$$;

revoke all on function app.own_event_invitees(uuid[]) from public, anon;
grant execute on function app.own_event_invitees(uuid[]) to authenticated;

-- Whether one of the caller's own events has invited people (the coach may not move or delete it, R63).
-- False for anyone else's event.
create function app.event_has_invites(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.event_invites i
     where i.event_id = p_event and i.owner = (select auth.uid()) and (select auth.uid()) is not null
  );
$$;

revoke all on function app.event_has_invites(uuid) from public, anon;
grant execute on function app.event_has_invites(uuid) to authenticated;

-- For an invited person: the OTHER people invited to the same event, with their answers, in the order
-- they were invited. "Not found" for an invitation that is not the caller's.
create function app.invite_people(p_invite uuid)
returns table (user_id uuid, answer text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_event uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select i.event_id into v_event from app.event_invites i where i.id = p_invite and i.invitee = uid;
  if v_event is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return query
    select i.invitee, i.answer from app.event_invites i
     where i.event_id = v_event and i.invitee <> uid
     order by i.created_at, i.invitee;
end;
$$;

revoke all on function app.invite_people(uuid) from public, anon;
grant execute on function app.invite_people(uuid) to authenticated;

-- ---------- Names and photos ----------

-- Who may see whose display name and photo (R43), as before, word for word, plus (R60): the owner of an
-- event and a person invited to it, and two people invited to the same event. The e-mail address stays
-- out of reach: app.profile_card keeps its own rule and is not changed.
create or replace function app.may_see_profile(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and p_owner is not null and (
    p_viewer = p_owner
    or exists (
      select 1 from app.contacts c
       where c.user_a = least(p_viewer, p_owner) and c.user_b = greatest(p_viewer, p_owner)
    )
    or exists (
      select 1 from app.contact_invitations i where i.from_user = p_owner and i.to_user = p_viewer
    )
    or exists (
      select 1 from app.lists l
       where (l.owner = p_viewer or exists (select 1 from app.list_members m where m.list_id = l.id and m.user_id = p_viewer))
         and (l.owner = p_owner or exists (select 1 from app.list_members m where m.list_id = l.id and m.user_id = p_owner))
    )
    or exists (
      select 1 from app.event_invites i
       where (i.owner = p_viewer and i.invitee = p_owner) or (i.owner = p_owner and i.invitee = p_viewer)
    )
    or exists (
      select 1 from app.event_invites a
        join app.event_invites b on b.event_id = a.event_id
       where a.invitee = p_viewer and b.invitee = p_owner
    )
  );
$$;

revoke all on function app.may_see_profile(uuid, uuid) from public, anon, authenticated;

-- The display name and photo time of each of these people that the signed-in user may see (as
-- app.may_see_profile says); nobody else gives a row. Never an e-mail address. fallback_name is the part
-- of the address before the "@", given only where the user may see the address anyway (themselves or a
-- contact), for a person without a display name; for anyone else it is empty and the app shows
-- "Invited person" (as stage 3's list_people did).
create function app.invite_person_names(p_users uuid[])
returns table (user_id uuid, display_name text, fallback_name text, photo_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, pr.display_name,
         case
           when pr.display_name is null and (
             u.id = (select auth.uid())
             or exists (
               select 1 from app.contacts c
                where c.user_a = least(u.id, (select auth.uid())) and c.user_b = greatest(u.id, (select auth.uid()))
             )
           ) then pg_catalog.split_part(u.email::text, '@', 1)
         end,
         ph.updated_at
    from auth.users u
    join app.profiles pr on pr.id = u.id
    left join app.profile_photos ph on ph.user_id = u.id
   where u.id = any (p_users)
     and app.may_see_profile((select auth.uid()), u.id)
   order by u.id;
$$;

revoke all on function app.invite_person_names(uuid[]) from public, anon;
grant execute on function app.invite_person_names(uuid[]) to authenticated;

-- ---------- Moving the event resets the answers ----------

-- When the owner moves an event (start, end, the days, or between timed and all-day), every answer goes
-- back to 'pending': the people agreed to another time (R62). Other changes (title, place, notes, done,
-- the goal, to-dos, what was sent to Outlook) keep the answers. It writes only app.event_invites, never
-- the event, so every path that updates events (edit_event, the coach's accept and undo, the Outlook
-- import and send) works as before; Outlook events never have invitations.
create function app.reset_event_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app.event_invites i
     set answer = 'pending', answered_at = null
   where i.event_id = new.id and i.answer <> 'pending';
  return null;
end;
$$;

revoke all on function app.reset_event_invites() from public, anon, authenticated;

create trigger reset_event_invites
  after update of start_at, end_at, first_day, last_day, all_day on app.events
  for each row
  when (
    old.start_at is distinct from new.start_at
    or old.end_at is distinct from new.end_at
    or old.first_day is distinct from new.first_day
    or old.last_day is distinct from new.last_day
    or old.all_day is distinct from new.all_day
  )
  execute function app.reset_event_invites();

commit;
