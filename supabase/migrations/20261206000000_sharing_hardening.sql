-- Hardening of sharing after a security review (specs 28 and 30). Run once in the Supabase SQL editor
-- after the earlier files (it needs 20261203000000_profiles_contacts.sql and
-- 20261205000000_shared_lists.sql).
--
-- Additive only: the code on main and on the sharing branches runs against the same database and must
-- keep working unchanged. One new table (app.list_leaves) and six functions replaced with
-- "create or replace", each with exactly the same signature, return type, security definer setting,
-- empty search path and rights as before; each body is copied from its current definition and changed
-- only where a fix needs it:
-- * app.invite_contact: the look-up of the address does the same work whether or not it has an account
--   (fix 1), and an address that belongs to an account the sender already has a row for gets a row only
--   the sender sees, instead of a swallowed error that left no row (fix 2).
-- * app.display_name_valid and app.list_text_valid: also refuse characters that render blank or are
--   invisible inside a word, and stacks of three or more combining marks; a display name needs at least
--   one letter or digit (fix 3). The same rules are in src/lib/profiles/display-name.ts and
--   src/lib/lists/text.ts.
-- * app.lock_usable_list: checks that the caller may use the list before it locks the list row, so a
--   stranger cannot learn through waiting that a list exists (fix 4).
-- * app.leave_list and app.add_list_member: a member who left a list by themselves cannot be added to
--   the same list again for 30 days, and nobody is a member of more than 50 lists of other people
--   (fix 7, R53).
--
-- The two text rules are used by check constraints. Postgres does not check existing rows again when a
-- function changes, but it does check a row again on its next update, so a stored name or title that the
-- stricter rule refuses would block every later update of that row. The block at the end of this file
-- therefore stops the whole file (nothing is changed) if any stored name or title breaks the new rules.
-- The file runs as one transaction (begin ... commit) so that this holds in any SQL editor.

begin;

-- ---------- Texts shown to other people (fix 3) ----------

-- 1 to 40 characters, no spaces at either end, no control characters, no invisible characters that
-- could disguise a name (zero-width marks, direction overrides, characters that render blank such as
-- U+3164 or U+2800, characters invisible inside a word such as the soft hyphen, variation selectors and
-- the tag block), at most two combining marks in a row, and at least one letter or digit. Postgres's
-- regular expressions have no class for "any combining mark", so the main combining blocks are named
-- one by one (U+0300 to U+036F, U+1AB0 to U+1AFF, U+1DC0 to U+1DFF, U+20D0 to U+20FF, U+FE20 to
-- U+FE2F); src/lib/profiles/display-name.ts names the very same blocks. \u takes four hex digits only,
-- so the tag block and the supplementary variation selectors are written with \U and eight.
create or replace function app.display_name_valid(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name is not null
     and pg_catalog.char_length(p_name) between 1 and 40
     and p_name !~ '[\u0001-\u001f\u007f-\u009f​-‏ -‮⁠-⁩﻿]'
     and p_name !~ '^[[:space:]   -   　]'
     and p_name !~ '[[:space:]   -   　]$'
     and p_name !~ '[­͏؜ᅟᅠ឴឵᠎⠀ㅤ︀-️ﾠ\U000e0000-\U000e007f\U000e0100-\U000e01ef]'
     and p_name !~ '[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]{3}'
     and p_name ~ '[[:alnum:]]';
$$;

revoke all on function app.display_name_valid(text) from public, anon;
grant execute on function app.display_name_valid(text) to authenticated;

-- A title shown to other people: p_max characters at most, at least one, no spaces at either end, no
-- control characters, no invisible characters that could disguise it (the same list as for a display
-- name above) and at most two combining marks in a row. No letter is needed: an entry of one emoji is
-- fine. The same rule is in src/lib/lists/text.ts.
create or replace function app.list_text_valid(p_text text, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text is not null
     and pg_catalog.char_length(p_text) between 1 and p_max
     and p_text !~ '[\u0001-\u001f\u007f-\u009f​-‏ -‮⁠-⁩﻿]'
     and p_text !~ '^[[:space:]   -   　]'
     and p_text !~ '[[:space:]   -   　]$'
     and p_text !~ '[­͏؜ᅟᅠ឴឵᠎⠀ㅤ︀-️ﾠ\U000e0000-\U000e007f\U000e0100-\U000e01ef]'
     and p_text !~ '[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]{3}';
$$;

revoke all on function app.list_text_valid(text, integer) from public, anon;
grant execute on function app.list_text_valid(text, integer) to authenticated;

-- ---------- Inviting (fixes 1 and 2) ----------

-- invite_contact (R44). Returns nothing, whatever happened to the address. Refused with a message of
-- its own only for things that do not depend on the address: the user's own address, a malformed
-- address, and the user's limits (100 contacts, 20 open invitations, 10 invitations per hour).
-- Then, without any sign to the caller:
-- * already contacts: nothing;
-- * the other person had invited me (still open): we become contacts;
-- * an invitation of mine to this address stands: nothing (a row only I see gets linked to the
--   account if the address now has one and I am not blocked by a decline);
-- * otherwise a new row: open to the account, or seen only by me when the address has no account, the
--   person declined me in the last 30 days, or I already have a row to that account under another
--   address (they changed their address since).
-- Errors in that part (two requests at the same moment, the other person's contact limit) are
-- swallowed and change nothing, so they cannot show up as a different answer either.
create or replace function app.invite_contact(p_email text)
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
    -- The same work whether or not the address has an account (R44): there is no index on
    -- lower(email), so a plain look-up (also PL/pgSQL's "select into", which stops at the first row)
    -- would end early on a match and read the whole table on a miss, and the time would tell. An
    -- aggregate always reads every row.
    select (pg_catalog.array_agg(u.id))[1] into v_target from auth.users u where pg_catalog.lower(u.email) = v_email;
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

    -- A row of mine to this account under another address (they changed their address): the new row
    -- is one only I see, like any other. Linking it would break unique (from_user, to_user), and the
    -- swallowed error would leave no row, which would tell me that both addresses are the same person.
    insert into app.contact_invitations (from_user, to_user, to_email)
    values (
      uid,
      case
        when v_target is not null and not v_blocked
         and not exists (select 1 from app.contact_invitations i where i.from_user = uid and i.to_user = v_target)
        then v_target
      end,
      v_email
    );
  exception when others then
    -- Swallowed on purpose (see above). Everything of this block is rolled back; the attempt counts.
    null;
  end;
end;
$$;

revoke all on function app.invite_contact(text) from public, anon;
grant execute on function app.invite_contact(text) to authenticated;

-- ---------- Locking a list (fix 4) ----------

-- The list for a change, locked until the end of the transaction (every change of one list takes its
-- turn here, so counts and places stay true). "Not found" when it does not exist or the caller may
-- not use it (R55: the same answer for a foreign list, a missing one and a malformed id). Returns the
-- owner. Internal: only the functions below call it.
-- The caller's right is checked before the lock, so someone who may not use the list never waits for
-- it (the wait would tell them that the list exists), and once more after it, because the membership
-- may have ended while they waited (each statement here sees what was committed before it started).
create or replace function app.lock_usable_list(p_list uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if not app.can_use_list(p_list) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  select l.owner into v_owner from app.lists l where l.id = p_list for update;
  if v_owner is null or not app.can_use_list(p_list) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return v_owner;
end;
$$;

revoke all on function app.lock_usable_list(uuid) from public, anon, authenticated;

-- ---------- Leaving and adding again (fix 7) ----------

-- A member who left a list by themselves: the owner cannot add them to the same list again until
-- "until" (30 days). Removed with the list, with the user and with the contact row between the two (a
-- contact removed and made again starts afresh). Read only by the functions below; nobody, not even the
-- two people, can read it.
create table app.list_leaves (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references app.lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null references app.contacts (id) on delete cascade,
  until timestamptz not null,
  constraint list_leaves_once unique (list_id, user_id)
);

create index list_leaves_user on app.list_leaves (user_id);
create index list_leaves_contact on app.list_leaves (contact_id);

-- Take away the rights that default privileges may have handed out. No grant and no policy, so nobody
-- reads or writes it except the functions.
revoke all on app.list_leaves from public, anon, authenticated;
alter table app.list_leaves enable row level security;

-- add_list_member: the owner adds one of their contacts, named by the contact row between the two of
-- them. "Not found" for a contact row the owner is not part of (also someone else's), so nobody can
-- add a stranger or go through another user's contact. Adding someone who is already a member changes
-- nothing. At most 20 members besides the owner, counted under the list's lock. Immediate: the member
-- accepted the owner as a contact already, and the list simply appears for them (R53).
-- Not someone who left this list by themselves in the last 30 days ("This person left the list"), and
-- not someone who is a member of 50 lists of other people already ("This person cannot join more
-- lists"), counted under a lock on that person's profile row so two owners at the same moment cannot
-- both pass.
create or replace function app.add_list_member(p_list uuid, p_contact uuid)
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
  if exists (
    select 1 from app.list_leaves lv where lv.list_id = p_list and lv.user_id = v_member and lv.until > pg_catalog.now()
  ) then
    raise exception 'This person left the list' using errcode = '22023';
  end if;
  if (select count(*) from app.list_members m where m.list_id = p_list) >= 20 then
    raise exception 'A list can have at most 20 members' using errcode = '22023';
  end if;
  perform 1 from app.profiles p where p.id = v_member for update;
  if (select count(*) from app.list_members m where m.user_id = v_member) >= 50 then
    raise exception 'This person cannot join more lists' using errcode = '22023';
  end if;
  -- A leave older than 30 days has done its work.
  delete from app.list_leaves lv where lv.list_id = p_list and lv.user_id = v_member;
  insert into app.list_members (list_id, user_id, contact_id) values (p_list, v_member, p_contact);
  return v_member;
end;
$$;

revoke all on function app.add_list_member(uuid, uuid) from public, anon;
grant execute on function app.add_list_member(uuid, uuid) to authenticated;

-- leave_list: a member leaves by themselves. The owner cannot leave; they delete the list. The owner
-- cannot add them to this list again for 30 days (app.list_leaves, R53).
create or replace function app.leave_list(p_list uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_contact uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if app.lock_usable_list(p_list) = uid then
    raise exception 'The owner cannot leave a list. Delete it instead' using errcode = '22023';
  end if;
  delete from app.list_members m where m.list_id = p_list and m.user_id = uid returning m.contact_id into v_contact;
  if v_contact is not null then
    insert into app.list_leaves (list_id, user_id, contact_id, until)
    values (p_list, uid, v_contact, pg_catalog.now() + interval '30 days')
    on conflict (list_id, user_id) do update set contact_id = excluded.contact_id, until = excluded.until;
  end if;
end;
$$;

revoke all on function app.leave_list(uuid) from public, anon;
grant execute on function app.leave_list(uuid) to authenticated;

-- ---------- Stored texts that the new rules refuse ----------

-- Stops this file, with nothing changed, if a stored display name, list title or entry title breaks
-- the stricter rules above (see the top of this file). Such rows would have to be looked at first.
do $$
begin
  if exists (select 1 from app.profiles p where p.display_name is not null and not app.display_name_valid(p.display_name))
     or exists (select 1 from app.lists l where not app.list_text_valid(l.title, 60))
     or exists (select 1 from app.list_items i where not app.list_text_valid(i.title, 200)) then
    raise exception 'A stored display name or list title breaks the new rules; nothing was changed. Find them with app.display_name_valid and app.list_text_valid first.';
  end if;
end;
$$;

commit;
