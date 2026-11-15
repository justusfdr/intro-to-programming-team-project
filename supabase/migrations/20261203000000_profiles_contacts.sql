-- Profiles and contacts (spec 28, branch 28-profiles-contacts), stage 1 of sharing. Run once in the
-- Supabase SQL editor after the earlier files.
--
-- Additive only: the code on main runs against the same database and must keep working unchanged.
-- One new column on app.profiles (empty for every existing row), five new tables, and functions.
-- Nothing existing is removed, renamed, made stricter or loosened: the select policy on app.profiles
-- stays "own row only", and there is still no write right on app.profiles for the user.
--
-- What one user may see of another (ontology R42 to R46):
-- * Their own profile, of course.
-- * A contact's display name, photo and e-mail address (contacts: one row per pair).
-- * The display name, photo and e-mail address of someone who invited them and whose invitation is
--   still open. The inviter sees nothing of the invited person until they accept.
-- * Nothing else. Other users' rows are read only through the security definer functions below,
--   which check the relation; the tables themselves answer only the two people involved.
--
-- No account enumeration (R44): app.invite_contact answers nothing, and the sender's own list of sent
-- invitations shows every address they typed, whether or not it has an account and whether or not
-- the other person declined. Which of these it is (the column to_user) is never readable by the
-- sender. Declining and addresses without an account leave a row only the sender sees.
--
-- Every write goes through a narrow security definer function (search_path empty, refuses a missing
-- auth.uid(), locks what it counts). The role "authenticated" cannot insert, update or delete any of
-- the new tables directly.

-- ---------- Display name ----------

-- 1 to 40 characters, no spaces at either end, no control characters and no invisible characters that
-- could disguise a name (zero-width marks, direction overrides). The same rule is in
-- src/lib/profiles/display-name.ts.
create function app.display_name_valid(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name is not null
     and pg_catalog.char_length(p_name) between 1 and 40
     and p_name !~ '[\u0001-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]'
     and p_name !~ '^[[:space:]\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]'
     and p_name !~ '[[:space:]\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]$';
$$;

revoke all on function app.display_name_valid(text) from public, anon;
grant execute on function app.display_name_valid(text) to authenticated;

-- Empty until the user sets it; until then the app shows the part of the e-mail address before the "@".
alter table app.profiles add column display_name text;
alter table app.profiles
  add constraint profiles_display_name_form check (display_name is null or app.display_name_valid(display_name));

-- The user writes only this column of their own row, and only through this function: a column grant
-- would be the first write right on app.profiles, next to the plan and the counters (R6).
create function app.set_display_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not app.display_name_valid(p_name) then
    raise exception 'Name must be 1 to 40 characters, without control characters' using errcode = '22023';
  end if;
  update app.profiles set display_name = p_name where id = uid;
end;
$$;

revoke all on function app.set_display_name(text) from public, anon;
grant execute on function app.set_display_name(text) to authenticated;

-- ---------- Profile photo ----------

-- The type of a photo, from its first bytes only (never a file name or a claimed type): JPEG, PNG or
-- WebP; null for anything else. The same rule is in src/lib/profiles/photo.ts.
create function app.photo_mime(p_bytes bytea)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_bytes is null then null
    when substring(p_bytes from 1 for 3) = '\xffd8ff'::bytea then 'image/jpeg'
    when substring(p_bytes from 1 for 8) = '\x89504e470d0a1a0a'::bytea then 'image/png'
    when substring(p_bytes from 1 for 4) = '\x52494646'::bytea and substring(p_bytes from 9 for 4) = '\x57454250'::bytea then 'image/webp'
  end;
$$;

revoke all on function app.photo_mime(bytea) from public, anon, authenticated;

create table app.profile_photos (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes bytea not null check (octet_length(bytes) between 1 and 200000),
  updated_at timestamptz not null default now(),
  -- The stored type is always the one the bytes themselves say.
  constraint profile_photos_type_matches check (mime = app.photo_mime(bytes))
);

-- ---------- Invitations, declines, contacts ----------

-- An invitation from one user to an e-mail address. to_user is the invited account while the invitation
-- is open to them; it is empty when the address has no account, when the invited person declined, or
-- when the sender is still blocked by a decline (30 days). Such a row is seen only by its sender, who
-- cannot read to_user, so their list looks the same in every case (R44). It is never turned into an
-- invitation by itself: inviting someone who is not a user yet is out of scope.
create table app.contact_invitations (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  -- Deleting the invited account keeps the sender's own row (an address they typed), without the link.
  to_user uuid references auth.users (id) on delete set null,
  -- The address as the sender typed it (trimmed, lower-case); shown only to the sender.
  to_email text not null check (app.is_guest_address(to_email)),
  created_at timestamptz not null default now(),
  constraint contact_invitations_pair unique (from_user, to_user),
  constraint contact_invitations_address unique (from_user, to_email),
  constraint contact_invitations_not_self check (to_user is null or to_user <> from_user)
);

create index contact_invitations_to_user on app.contact_invitations (to_user);

-- A decline: the sender may not invite this person again until "until" (30 days). Read only by the
-- functions below; nobody, not even the two people, can read it.
create table app.contact_declines (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  until timestamptz not null,
  constraint contact_declines_pair unique (from_user, to_user)
);

-- Every invitation a user sent in the last hour (the time only, never the address), for the limit of
-- 10 per hour. Counted in the database, so it holds across servers. Read only by app.invite_contact.
create table app.contact_invite_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);

create index contact_invite_attempts_user_at on app.contact_invite_attempts (user_id, at);

-- Two users who accepted each other: one row per pair, the smaller id first. Later stages hang their
-- shares on this row with "on delete cascade", so removing a contact ends every share at once.
create table app.contacts (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint contacts_order check (user_a < user_b),
  constraint contacts_pair unique (user_a, user_b)
);

create index contacts_user_b on app.contacts (user_b);

-- ---------- Rights and row-level security ----------

-- Take away the rights that default privileges may have handed out, then grant only reading.
revoke all on app.profile_photos, app.contact_invitations, app.contact_declines, app.contact_invite_attempts, app.contacts
  from public, anon, authenticated;

alter table app.profile_photos enable row level security;
alter table app.contact_invitations enable row level security;
alter table app.contact_declines enable row level security;
alter table app.contact_invite_attempts enable row level security;
alter table app.contacts enable row level security;

grant select on app.profile_photos to authenticated;
create policy "Users read their own photo" on app.profile_photos
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Not to_user: the sender must not be able to tell an open invitation from one to an address without
-- an account or one that was declined (R44). The policy itself may look at it.
grant select (id, from_user, to_email, created_at) on app.contact_invitations to authenticated;
create policy "Sender and invited user read an invitation" on app.contact_invitations
  for select to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

grant select on app.contacts to authenticated;
create policy "Both people read their contact row" on app.contacts
  for select to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));

-- app.contact_declines and app.contact_invite_attempts: no grant and no policy, so nobody reads them.

-- ---------- Helpers ----------

-- Whether two users are contacts. For the policies of later stages. Answers only for a pair that
-- includes the signed-in user (false otherwise), so nobody can map who knows whom.
create function app.is_contact(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and (select auth.uid()) in (p_a, p_b)
     and exists (
       select 1 from app.contacts c
        where c.user_a = least(p_a, p_b) and c.user_b = greatest(p_a, p_b) and p_a <> p_b
     );
$$;

revoke all on function app.is_contact(uuid, uuid) from public, anon;
grant execute on function app.is_contact(uuid, uuid) to authenticated;

-- Whether p_viewer may see p_owner's display name and photo (R43): themselves, a contact, or someone
-- whose invitation to p_viewer is open. Internal: only the functions below call it.
create function app.may_see_profile(p_viewer uuid, p_owner uuid)
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
  );
$$;

revoke all on function app.may_see_profile(uuid, uuid) from public, anon, authenticated;

-- Makes two users contacts and clears everything between them: invitations in both directions (also
-- the rows only a sender sees) and declines. Internal.
create function app.make_contacts(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app.contacts (user_a, user_b) values (least(p_a, p_b), greatest(p_a, p_b))
    on conflict (user_a, user_b) do nothing;
  delete from app.contact_invitations i
   where (i.from_user = p_a and (i.to_user = p_b or i.to_email = (select pg_catalog.lower(u.email) from auth.users u where u.id = p_b)))
      or (i.from_user = p_b and (i.to_user = p_a or i.to_email = (select pg_catalog.lower(u.email) from auth.users u where u.id = p_a)));
  delete from app.contact_declines d
   where (d.from_user = p_a and d.to_user = p_b) or (d.from_user = p_b and d.to_user = p_a);
end;
$$;

revoke all on function app.make_contacts(uuid, uuid) from public, anon, authenticated;

-- ---------- Photo: write, remove, read ----------

-- Saves the signed-in user's photo. The bytes arrive as base64 text (decoded here); their type comes
-- from the bytes. Refused, with nothing changed: more than 200,000 bytes, or not JPEG, PNG or WebP.
create function app.set_profile_photo(p_data text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_bytes bytea;
  v_mime text;
  v_at timestamptz;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  begin
    v_bytes := pg_catalog.decode(p_data, 'base64');
  exception when others then
    raise exception 'A photo must be a JPEG, PNG or WebP image' using errcode = '22023';
  end;
  if v_bytes is null or pg_catalog.octet_length(v_bytes) > 200000 then
    raise exception 'A photo can be at most 200 KB' using errcode = '22023';
  end if;
  v_mime := app.photo_mime(v_bytes);
  if v_mime is null then
    raise exception 'A photo must be a JPEG, PNG or WebP image' using errcode = '22023';
  end if;
  insert into app.profile_photos (user_id, mime, bytes, updated_at)
  values (uid, v_mime, v_bytes, pg_catalog.clock_timestamp())
  on conflict (user_id) do update set mime = excluded.mime, bytes = excluded.bytes, updated_at = excluded.updated_at
  returning updated_at into v_at;
  return v_at;
end;
$$;

revoke all on function app.set_profile_photo(text) from public, anon;
grant execute on function app.set_profile_photo(text) to authenticated;

-- Removes the signed-in user's photo (nothing to do when there is none).
create function app.remove_profile_photo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from app.profile_photos where user_id = uid;
end;
$$;

revoke all on function app.remove_profile_photo() from public, anon;
grant execute on function app.remove_profile_photo() to authenticated;

-- A user's photo for the signed-in user, as base64 text without line breaks, only when R43 allows it.
-- No row in every other case (no such user, not allowed, no photo): the caller cannot tell them apart.
create function app.profile_photo(p_user uuid)
returns table (mime text, data text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select ph.mime, pg_catalog.translate(pg_catalog.encode(ph.bytes, 'base64'), E'\n', ''), ph.updated_at
    from app.profile_photos ph
   where ph.user_id = p_user
     and app.may_see_profile((select auth.uid()), p_user);
$$;

revoke all on function app.profile_photo(uuid) from public, anon;
grant execute on function app.profile_photo(uuid) to authenticated;

-- ---------- Inviting ----------

-- invite_contact (R44). Returns nothing, whatever happened to the address. Refused with a message of
-- its own only for things that do not depend on the address: the user's own address, a malformed
-- address, and the user's limits (100 contacts, 20 open invitations, 10 invitations per hour).
-- Then, without any sign to the caller:
-- * already contacts: nothing;
-- * the other person had invited me (still open): we become contacts;
-- * an invitation of mine to this address stands: nothing (a row only I see gets linked to the
--   account if the address now has one and I am not blocked by a decline);
-- * otherwise a new row: open to the account, or seen only by me when the address has no account or
--   the person declined me in the last 30 days.
-- Errors in that part (two requests at the same moment, the other person's contact limit) are
-- swallowed and change nothing, so they cannot show up as a different answer either.
create function app.invite_contact(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_own text;
  v_target uuid;
  v_mine uuid;
  v_mine_to uuid;
  v_theirs uuid;
  v_contact boolean;
  v_blocked boolean;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not app.is_guest_address(v_email) then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  -- One invitation at a time per sender, so the counts stay true until the end of the transaction.
  perform 1 from app.profiles p where p.id = uid for update;
  select pg_catalog.lower(u.email) into v_own from auth.users u where u.id = uid;
  if v_own = v_email then
    raise exception 'You cannot invite yourself' using errcode = '22023';
  end if;
  if (select count(*) from app.contacts c where c.user_a = uid or c.user_b = uid) >= 100 then
    raise exception 'You can have at most 100 contacts' using errcode = '22023';
  end if;
  if (select count(*) from app.contact_invitations i where i.from_user = uid) >= 20 then
    raise exception 'You can have at most 20 open invitations' using errcode = '22023';
  end if;
  delete from app.contact_invite_attempts a where a.user_id = uid and a.at <= pg_catalog.now() - interval '1 hour';
  if (select count(*) from app.contact_invite_attempts a where a.user_id = uid) >= 10 then
    raise exception 'You can send at most 10 invitations per hour' using errcode = '22023';
  end if;
  insert into app.contact_invite_attempts (user_id) values (uid);

  -- From here on, nothing the caller can see depends on the address.
  begin
    select u.id into v_target from auth.users u where pg_catalog.lower(u.email) = v_email limit 1;
    select i.id, i.to_user into v_mine, v_mine_to
      from app.contact_invitations i where i.from_user = uid and i.to_email = v_email for update;
    v_contact := v_target is not null and exists (
      select 1 from app.contacts c where c.user_a = least(uid, v_target) and c.user_b = greatest(uid, v_target)
    );
    v_blocked := v_target is not null and exists (
      select 1 from app.contact_declines d where d.from_user = uid and d.to_user = v_target and d.until > pg_catalog.now()
    );
    if v_contact then
      return;
    end if;

    -- They invited me first and it is still open: my invitation accepts theirs.
    if v_target is not null then
      select i.id into v_theirs from app.contact_invitations i where i.from_user = v_target and i.to_user = uid for update;
      if v_theirs is not null then
        perform 1 from app.profiles p where p.id = v_target for update;
        if (select count(*) from app.contacts c where c.user_a = v_target or c.user_b = v_target) < 100 then
          perform app.make_contacts(uid, v_target);
          return;
        end if;
      end if;
    end if;

    if v_mine is not null then
      if v_mine_to is null and v_target is not null and not v_blocked then
        update app.contact_invitations set to_user = v_target where id = v_mine;
      end if;
      return;
    end if;

    insert into app.contact_invitations (from_user, to_user, to_email)
    values (uid, case when v_target is not null and not v_blocked then v_target end, v_email);
  exception when others then
    -- Swallowed on purpose (see above). Everything of this block is rolled back; the attempt counts.
    null;
  end;
end;
$$;

revoke all on function app.invite_contact(text) from public, anon;
grant execute on function app.invite_contact(text) to authenticated;

-- ---------- Answering, withdrawing, removing ----------

-- The invited user accepts (both become contacts) or declines (the invitation is gone for them; the
-- sender is not told and is blocked for 30 days, silently). "Not found" for anything that is not an
-- open invitation to the signed-in user.
create function app.answer_invitation(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_from uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select i.from_user into v_from from app.contact_invitations i where i.id = p_id and i.to_user = uid for update;
  if v_from is null or p_accept is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if p_accept then
    -- Both profiles in the order of their ids, so two answers at the same moment cannot deadlock.
    perform 1 from app.profiles p where p.id in (uid, v_from) order by p.id for update;
    if (select count(*) from app.contacts c where c.user_a = uid or c.user_b = uid) >= 100 then
      raise exception 'You can have at most 100 contacts' using errcode = '22023';
    end if;
    if (select count(*) from app.contacts c where c.user_a = v_from or c.user_b = v_from) >= 100 then
      raise exception 'This person cannot add more contacts' using errcode = '22023';
    end if;
    perform app.make_contacts(uid, v_from);
  else
    -- The row stays for the sender only, looking as before.
    update app.contact_invitations set to_user = null where id = p_id;
    insert into app.contact_declines (from_user, to_user, until)
    values (v_from, uid, pg_catalog.now() + interval '30 days')
    on conflict (from_user, to_user) do update set until = excluded.until;
  end if;
end;
$$;

revoke all on function app.answer_invitation(uuid, boolean) from public, anon;
grant execute on function app.answer_invitation(uuid, boolean) to authenticated;

-- The sender withdraws one of their invitations (also one only they see). "Not found" otherwise.
create function app.withdraw_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from app.contact_invitations i where i.id = p_id and i.from_user = uid;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function app.withdraw_invitation(uuid) from public, anon;
grant execute on function app.withdraw_invitation(uuid) to authenticated;

-- Either side removes a contact. From that moment neither sees the other's profile, and every share
-- of later stages that hangs on the row goes with it. "Not found" otherwise.
create function app.remove_contact(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from app.contacts c where c.id = p_contact_id and (c.user_a = uid or c.user_b = uid);
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function app.remove_contact(uuid) from public, anon;
grant execute on function app.remove_contact(uuid) to authenticated;

-- ---------- Reading the cards ----------

-- Everything the signed-in user may see of people, one row per card:
-- * 'self': their own display name, e-mail address and photo time;
-- * 'contact': each contact's (id: the contact row);
-- * 'received': each open invitation to them, with the inviter's card (id: the invitation);
-- * 'sent': each of their invitations, with only the address they typed and the date (id: the
--   invitation). Whether it is open to an account is not said (R44).
-- display_name is empty when not set (the app then shows the part of the address before the "@");
-- photo_at is the time of the photo, empty without one.
create function app.contact_cards()
returns table (kind text, id uuid, user_id uuid, display_name text, email text, photo_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid)
  select 'self'::text, null::uuid, u.id, p.display_name, u.email::text, ph.updated_at, null::timestamptz
    from me join auth.users u on u.id = me.uid
    join app.profiles p on p.id = u.id
    left join app.profile_photos ph on ph.user_id = u.id
  union all
  select 'contact'::text, c.id, o.id, p.display_name, o.email::text, ph.updated_at, c.created_at
    from me join app.contacts c on me.uid in (c.user_a, c.user_b)
    join auth.users o on o.id = case when c.user_a = me.uid then c.user_b else c.user_a end
    join app.profiles p on p.id = o.id
    left join app.profile_photos ph on ph.user_id = o.id
  union all
  select 'received'::text, i.id, o.id, p.display_name, o.email::text, ph.updated_at, i.created_at
    from me join app.contact_invitations i on i.to_user = me.uid
    join auth.users o on o.id = i.from_user
    join app.profiles p on p.id = o.id
    left join app.profile_photos ph on ph.user_id = o.id
  union all
  select 'sent'::text, i.id, null::uuid, null::text, i.to_email, null::timestamptz, i.created_at
    from me join app.contact_invitations i on i.from_user = me.uid;
$$;

revoke all on function app.contact_cards() from public, anon;
grant execute on function app.contact_cards() to authenticated;

-- The number of open invitations to the signed-in user (the badge on "People").
create function app.received_invitation_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from app.contact_invitations i where i.to_user = (select auth.uid()) and (select auth.uid()) is not null;
$$;

revoke all on function app.received_invitation_count() from public, anon;
grant execute on function app.received_invitation_count() to authenticated;
