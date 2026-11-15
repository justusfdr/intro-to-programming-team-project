-- Shared to-do lists (spec 30, branch 30-shared-lists), stage 3 of sharing. Run once in the Supabase
-- SQL editor after the earlier files (it needs the contacts of 20261203000000_profiles_contacts.sql).
--
-- Additive only: the code on main runs against the same database and must keep working unchanged.
-- Three new tables and functions. Nothing existing is removed, renamed or loosened: the private tasks
-- and goals (app.tasks, app.goals) are not touched at all. The one existing function that changes is
-- app.may_see_profile, which keeps its old conditions word for word and gets one more (R56: people who
-- share a list see each other's display name and photo).
--
-- Who sees what (ontology R52 to R57):
-- * A list is seen only by its owner and its members, with its entries and its member list. Everyone
--   else gets nothing ("Not found" from the functions, no rows from the tables).
-- * A member is always a contact of the owner: the membership hangs on that contact row with
--   "on delete cascade", so removing the contact ends the membership in the same moment.
-- * Inside a list everyone sees the display name and photo of the others, never their e-mail address.
--
-- Every write goes through a narrow security definer function (search_path empty, refuses a missing
-- auth.uid(), checks the caller's role in that list, locks the list row before it counts or renumbers).
-- The role "authenticated" can only read the three tables (row-level security), never write them.

-- ---------- Texts ----------

-- A title shown to other people: p_max characters at most, at least one, no spaces at either end, no
-- control characters and no invisible characters that could disguise it (zero-width marks, direction
-- overrides). The same rule is in src/lib/lists/text.ts.
create function app.list_text_valid(p_text text, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text is not null
     and pg_catalog.char_length(p_text) between 1 and p_max
     and p_text !~ '[\u0001-\u001f\u007f-\u009f​-‏ -‮⁠-⁩﻿]'
     and p_text !~ '^[[:space:]   -   　]'
     and p_text !~ '[[:space:]   -   　]$';
$$;

revoke all on function app.list_text_valid(text, integer) from public, anon;
grant execute on function app.list_text_valid(text, integer) to authenticated;

-- ---------- Tables ----------

-- A list of the user who created it (its owner). Deleting the owner's account deletes it with
-- everything in it. updated_at changes only with the title (R4 for renaming).
create table app.lists (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default date_trunc('milliseconds', now()),
  constraint lists_title check (app.list_text_valid(title, 60))
);

create index lists_owner on app.lists (owner);

-- A member of a list: always a contact of the owner, through that contact row. Removing the contact
-- (either side, R46) or deleting either account removes the membership. The owner is never a member.
create table app.list_members (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references app.lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null references app.contacts (id) on delete cascade,
  added_at timestamptz not null default now(),
  constraint list_members_once unique (list_id, user_id)
);

create index list_members_user on app.list_members (user_id);
create index list_members_contact on app.list_members (contact_id);

-- An entry of a list. Who added it and who ticked it stay as user ids; when that account is deleted the
-- entry stays, without a name. updated_at changes with the title, the tick and the entry's own move,
-- not when other entries close up around it (R4: "Changed by someone else").
create table app.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references app.lists (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  -- The place in the list: 0, 1, 2, … The functions keep the numbers without gaps.
  position integer not null,
  added_by uuid references auth.users (id) on delete set null,
  done_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default date_trunc('milliseconds', now()),
  constraint list_items_title check (app.list_text_valid(title, 200)),
  constraint list_items_position check (position between 0 and 199),
  -- Only a ticked entry remembers who ticked it.
  constraint list_items_done_by check (done or done_by is null),
  -- One entry per place. Checked at the end of each statement, so one statement can renumber the list.
  constraint list_items_one_per_position unique (list_id, position) deferrable initially immediate
);

create index list_items_added_by on app.list_items (added_by);
create index list_items_done_by on app.list_items (done_by);

-- ---------- Who may use a list ----------

-- Whether the signed-in user is the list's owner or one of its members. Security definer, so the
-- policies below can ask it without reading each other's tables (no recursion).
create function app.can_use_list(p_list uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from app.lists l where l.id = p_list and l.owner = (select auth.uid()))
    or exists (select 1 from app.list_members m where m.list_id = p_list and m.user_id = (select auth.uid()))
  );
$$;

revoke all on function app.can_use_list(uuid) from public, anon;
grant execute on function app.can_use_list(uuid) to authenticated;

-- ---------- Rights and row-level security ----------

-- Take away the rights that default privileges may have handed out, then grant only reading.
revoke all on app.lists, app.list_members, app.list_items from public, anon, authenticated;

alter table app.lists enable row level security;
alter table app.list_members enable row level security;
alter table app.list_items enable row level security;

grant select on app.lists to authenticated;
create policy "Owner and members read a list" on app.lists
  for select to authenticated
  using (app.can_use_list(id));

-- Not contact_id: which contact row carries a membership is nobody's business but the functions'.
grant select (id, list_id, user_id, added_at) on app.list_members to authenticated;
create policy "Owner and members read the member list" on app.list_members
  for select to authenticated
  using (app.can_use_list(list_id));

grant select on app.list_items to authenticated;
create policy "Owner and members read the entries" on app.list_items
  for select to authenticated
  using (app.can_use_list(list_id));

-- No insert, update or delete right on the three tables: every change goes through the functions below.

-- ---------- Seeing each other inside a list ----------

-- R43 with one more condition (spec 30, R56): two users who share a list (each its owner or a member)
-- see each other's display name and photo. The first three conditions are unchanged, word for word.
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
  );
$$;

revoke all on function app.may_see_profile(uuid, uuid) from public, anon, authenticated;

-- The people of a list for someone who may use it: the owner first, then the members in the order they
-- were added. Their display name and photo time; never an e-mail address. fallback_name is the part of
-- the address before the "@", given only where the viewer may see the address anyway (themselves or a
-- contact), for a person without a display name; for anyone else it is empty and the app shows "Member".
-- No row at all for a list the viewer may not use.
create function app.list_people(p_list uuid)
returns table (user_id uuid, is_owner boolean, display_name text, fallback_name text, photo_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with people as (
    select l.owner as uid, true as is_owner, l.created_at as since
      from app.lists l where l.id = p_list
    union all
    select m.user_id, false, m.added_at
      from app.list_members m where m.list_id = p_list
  )
  select p.uid, p.is_owner, pr.display_name,
         case
           when pr.display_name is null and (
             p.uid = (select auth.uid())
             or exists (
               select 1 from app.contacts c
                where c.user_a = least(p.uid, (select auth.uid())) and c.user_b = greatest(p.uid, (select auth.uid()))
             )
           ) then pg_catalog.split_part(u.email::text, '@', 1)
         end,
         ph.updated_at
    from people p
    join auth.users u on u.id = p.uid
    join app.profiles pr on pr.id = p.uid
    left join app.profile_photos ph on ph.user_id = p.uid
   where app.can_use_list(p_list)
   order by p.is_owner desc, p.since, p.uid;
$$;

revoke all on function app.list_people(uuid) from public, anon;
grant execute on function app.list_people(uuid) to authenticated;

-- ---------- Internal helpers ----------

-- The list for a change, locked until the end of the transaction (every change of one list takes its
-- turn here, so counts and places stay true). "Not found" when it does not exist or the caller may
-- not use it (R55: the same answer for a foreign list, a missing one and a malformed id). Returns the
-- owner. Internal: only the functions below call it.
create function app.lock_usable_list(p_list uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select l.owner into v_owner from app.lists l where l.id = p_list for update;
  if v_owner is null or not app.can_use_list(p_list) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return v_owner;
end;
$$;

revoke all on function app.lock_usable_list(uuid) from public, anon, authenticated;

-- The same for a change only the owner may make: a member gets their own message (they see the list).
create function app.lock_own_list(p_list uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.lock_usable_list(p_list) <> (select auth.uid()) then
    raise exception 'Only the owner of this list can do this' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.lock_own_list(uuid) from public, anon, authenticated;

-- The entry for a change: its list locked first (always list, then entry, so two changes cannot
-- deadlock), then the entry. "Not found" for an entry that does not exist or of a list the caller may
-- not use; "Changed by someone else" when its updated_at is not the one the screen last saw (R4).
-- Returns the list's id.
create function app.lock_list_item(p_item uuid, p_updated_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list uuid;
  v_updated timestamptz;
begin
  select i.list_id into v_list from app.list_items i where i.id = p_item;
  if v_list is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  perform app.lock_usable_list(v_list);
  select i.updated_at into v_updated from app.list_items i where i.id = p_item and i.list_id = v_list for update;
  if v_updated is null or p_updated_at is null or v_updated <> p_updated_at then
    raise exception 'Changed by someone else. Reload to see the latest version' using errcode = 'P0001';
  end if;
  return v_list;
end;
$$;

revoke all on function app.lock_list_item(uuid, timestamptz) from public, anon, authenticated;

-- The next updated_at of a row: the database's clock in whole milliseconds (so it survives the trip
-- through JavaScript unchanged), and always later than the old value.
create function app.next_list_version(p_old timestamptz)
returns timestamptz
language sql
volatile
set search_path = ''
as $$
  select greatest(pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()), p_old + interval '1 millisecond');
$$;

revoke all on function app.next_list_version(timestamptz) from public, anon, authenticated;

-- Numbers the entries of a list 0, 1, 2, … in the order of p_ids (every entry of the list, each once).
create function app.renumber_list_items(p_list uuid, p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update app.list_items i
     set position = (x.n - 1)::integer
    from pg_catalog.unnest(p_ids) with ordinality as x(id, n)
   where i.id = x.id and i.list_id = p_list and i.position <> (x.n - 1)::integer;
$$;

revoke all on function app.renumber_list_items(uuid, uuid[]) from public, anon, authenticated;

-- ---------- Lists ----------

-- create_list: a list of the signed-in user's own, without members. At most 20 per owner, counted
-- under a lock on the owner's profile row, so two requests at the same moment cannot pass together.
create function app.create_list(p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not app.list_text_valid(p_title, 60) then
    raise exception 'A list needs a title of 1 to 60 characters' using errcode = '22023';
  end if;
  perform 1 from app.profiles p where p.id = uid for update;
  if (select count(*) from app.lists l where l.owner = uid) >= 20 then
    raise exception 'You can have at most 20 lists' using errcode = '22023';
  end if;
  insert into app.lists (owner, title) values (uid, p_title) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function app.create_list(text) from public, anon;
grant execute on function app.create_list(text) to authenticated;

-- rename_list: the owner only, carrying the updated_at the screen last saw (R4).
create function app.rename_list(p_list uuid, p_title text, p_updated_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_updated timestamptz;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform app.lock_own_list(p_list);
  select l.updated_at into v_updated from app.lists l where l.id = p_list;
  if p_updated_at is null or v_updated <> p_updated_at then
    raise exception 'Changed by someone else. Reload to see the latest version' using errcode = 'P0001';
  end if;
  if not app.list_text_valid(p_title, 60) then
    raise exception 'A list needs a title of 1 to 60 characters' using errcode = '22023';
  end if;
  update app.lists set title = p_title, updated_at = app.next_list_version(updated_at) where id = p_list;
end;
$$;

revoke all on function app.rename_list(uuid, text, timestamptz) from public, anon;
grant execute on function app.rename_list(uuid, text, timestamptz) to authenticated;

-- delete_list: the owner only; the members and the entries go with it.
create function app.delete_list(p_list uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform app.lock_own_list(p_list);
  delete from app.lists where id = p_list;
end;
$$;

revoke all on function app.delete_list(uuid) from public, anon;
grant execute on function app.delete_list(uuid) to authenticated;

-- ---------- Members ----------

-- add_list_member: the owner adds one of their contacts, named by the contact row between the two of
-- them. "Not found" for a contact row the owner is not part of (also someone else's), so nobody can
-- add a stranger or go through another user's contact. Adding someone who is already a member changes
-- nothing. At most 20 members besides the owner, counted under the list's lock. Immediate: the member
-- accepted the owner as a contact already, and the list simply appears for them (R53).
create function app.add_list_member(p_list uuid, p_contact uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_member uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform app.lock_own_list(p_list);
  select case when c.user_a = uid then c.user_b else c.user_a end into v_member
    from app.contacts c
   where c.id = p_contact and uid in (c.user_a, c.user_b)
     for share;
  if v_member is null or v_member = uid then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from app.list_members m where m.list_id = p_list and m.user_id = v_member) then
    return v_member;
  end if;
  if (select count(*) from app.list_members m where m.list_id = p_list) >= 20 then
    raise exception 'A list can have at most 20 members' using errcode = '22023';
  end if;
  insert into app.list_members (list_id, user_id, contact_id) values (p_list, v_member, p_contact);
  return v_member;
end;
$$;

revoke all on function app.add_list_member(uuid, uuid) from public, anon;
grant execute on function app.add_list_member(uuid, uuid) to authenticated;

-- remove_list_member: the owner takes a member out. "Not found" for someone who is not a member.
create function app.remove_list_member(p_list uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform app.lock_own_list(p_list);
  delete from app.list_members m where m.list_id = p_list and m.user_id = p_user;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function app.remove_list_member(uuid, uuid) from public, anon;
grant execute on function app.remove_list_member(uuid, uuid) to authenticated;

-- leave_list: a member leaves by themselves. The owner cannot leave; they delete the list.
create function app.leave_list(p_list uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if app.lock_usable_list(p_list) = uid then
    raise exception 'The owner cannot leave a list. Delete it instead' using errcode = '22023';
  end if;
  delete from app.list_members m where m.list_id = p_list and m.user_id = uid;
end;
$$;

revoke all on function app.leave_list(uuid) from public, anon;
grant execute on function app.leave_list(uuid) to authenticated;

-- ---------- Entries ----------

-- add_list_item: the owner or a member adds an entry at the end of the list, not done. At most 200
-- per list, counted under the list's lock. Returns the new entry's id.
create function app.add_list_item(p_list uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_count integer;
  v_id uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  perform app.lock_usable_list(p_list);
  if not app.list_text_valid(p_title, 200) then
    raise exception 'An entry needs a title of 1 to 200 characters' using errcode = '22023';
  end if;
  select count(*)::integer into v_count from app.list_items i where i.list_id = p_list;
  if v_count >= 200 then
    raise exception 'A list can have at most 200 entries' using errcode = '22023';
  end if;
  insert into app.list_items (list_id, title, position, added_by)
  values (p_list, p_title, v_count, uid)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function app.add_list_item(uuid, text) from public, anon;
grant execute on function app.add_list_item(uuid, text) to authenticated;

-- rename_list_item: anyone of the list, carrying the entry's updated_at (R4). Returns the list's id.
create function app.rename_list_item(p_item uuid, p_title text, p_updated_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_list uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  v_list := app.lock_list_item(p_item, p_updated_at);
  if not app.list_text_valid(p_title, 200) then
    raise exception 'An entry needs a title of 1 to 200 characters' using errcode = '22023';
  end if;
  update app.list_items set title = p_title, updated_at = app.next_list_version(updated_at) where id = p_item;
  return v_list;
end;
$$;

revoke all on function app.rename_list_item(uuid, text, timestamptz) from public, anon;
grant execute on function app.rename_list_item(uuid, text, timestamptz) to authenticated;

-- tick_list_item: anyone of the list ticks or unticks an entry, carrying its updated_at (R4). A tick
-- remembers who ticked it; unticking forgets it. Returns the list's id.
create function app.tick_list_item(p_item uuid, p_done boolean, p_updated_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_list uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_done is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  v_list := app.lock_list_item(p_item, p_updated_at);
  update app.list_items
     set done = p_done, done_by = case when p_done then uid end, updated_at = app.next_list_version(updated_at)
   where id = p_item;
  return v_list;
end;
$$;

revoke all on function app.tick_list_item(uuid, boolean, timestamptz) from public, anon;
grant execute on function app.tick_list_item(uuid, boolean, timestamptz) to authenticated;

-- move_list_item: anyone of the list moves an entry to another place (counted from 0; a place past the
-- end means the end), carrying its updated_at (R4); the others close up. Returns the list's id.
create function app.move_list_item(p_item uuid, p_to integer, p_updated_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_list uuid;
  v_others uuid[];
  v_at integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  v_list := app.lock_list_item(p_item, p_updated_at);
  select coalesce(array_agg(i.id order by i.position), '{}') into v_others
    from app.list_items i where i.list_id = v_list and i.id <> p_item;
  v_at := least(greatest(coalesce(p_to, 0), 0), pg_catalog.cardinality(v_others));
  perform app.renumber_list_items(v_list, v_others[1:v_at] || p_item || v_others[v_at + 1:]);
  update app.list_items set updated_at = app.next_list_version(updated_at) where id = p_item;
  return v_list;
end;
$$;

revoke all on function app.move_list_item(uuid, integer, timestamptz) from public, anon;
grant execute on function app.move_list_item(uuid, integer, timestamptz) to authenticated;

-- delete_list_item: anyone of the list deletes an entry, carrying its updated_at (R4); the later ones
-- move up. Returns the list's id.
create function app.delete_list_item(p_item uuid, p_updated_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_list uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  v_list := app.lock_list_item(p_item, p_updated_at);
  delete from app.list_items where id = p_item;
  perform app.renumber_list_items(
    v_list,
    (select coalesce(array_agg(i.id order by i.position), '{}') from app.list_items i where i.list_id = v_list)
  );
  return v_list;
end;
$$;

revoke all on function app.delete_list_item(uuid, timestamptz) from public, anon;
grant execute on function app.delete_list_item(uuid, timestamptz) to authenticated;
