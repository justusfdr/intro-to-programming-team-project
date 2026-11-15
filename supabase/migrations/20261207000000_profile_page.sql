-- The profile page (spec 31, branch 32-profile-page). Run once in the Supabase SQL editor after the
-- earlier files (it needs 20261203000000_profiles_contacts.sql and 20261206000000_sharing_hardening.sql).
--
-- Additive only: the code on main and on the sharing branches runs against the same database and must
-- keep working unchanged. Two new, empty columns on app.profiles with their checks, and three new
-- functions. Nothing existing is removed, renamed, replaced, made stricter or loosened:
-- * app.set_display_name stays as it is; app.set_profile writes the name, the bio and the link together.
-- * app.contact_cards() stays as it is: a function that returns a table cannot gain columns with
--   "create or replace", and dropping it would break the deployed code for a moment. The new
--   app.profile_card(p_user) reads one person's whole card instead.
-- * The select policy on app.profiles stays "own row only", and there is still no write right on
--   app.profiles for the user (R6): the new columns are written only through app.set_profile.
--
-- What another user sees (ontology R43, spec 31): the user themselves, their contacts, and someone the
-- user invited while the invitation is open see the display name, photo, bio, LinkedIn link and time
-- zone (the time zone is read from app.settings, never copied) and the e-mail address. Nothing else of
-- the settings. People who only share a list (R55) keep seeing the name and photo inside the list, as
-- before, and nothing of this card.
--
-- The file runs as one transaction (begin ... commit) so that it is all or nothing in any SQL editor.

begin;

-- ---------- The LinkedIn link ----------

-- Exactly https://www.linkedin.com/in/<slug>, the slug 3 to 100 characters of A-Z, a-z, 0-9, "-", "_"
-- and "%" (percent-encoded letters). Nothing else can be stored: no other scheme (javascript:, data:),
-- no other host, no other path, no query, no trailing slash. Ranges in Postgres's regular expressions
-- go by code point, so [A-Za-z0-9] is ASCII only in every locale. The same pattern is in
-- src/lib/profiles/linkedin.ts (LINKEDIN_URL), which also turns the other forms people paste
-- (without scheme, http://, linkedin.com, de.linkedin.com, a trailing slash) into this one.
create function app.linkedin_url_valid(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is not null
     and p_url ~ '^https://www\.linkedin\.com/in/[A-Za-z0-9_%-]{3,100}$';
$$;

revoke all on function app.linkedin_url_valid(text) from public, anon;
grant execute on function app.linkedin_url_valid(text) to authenticated;

-- ---------- The new columns ----------

-- bio: 1 to 160 characters, one line, the same rule as a list title (app.list_text_valid: no spaces at
-- either end, no control characters, so no line breaks, no invisible characters, at most two combining
-- marks in a row; emoji are fine). Empty until set; clearing it makes it empty again.
alter table app.profiles add column bio text;
alter table app.profiles
  add constraint profiles_bio_form check (bio is null or app.list_text_valid(bio, 160));

-- linkedin_url: the form above, or empty.
alter table app.profiles add column linkedin_url text;
alter table app.profiles
  add constraint profiles_linkedin_url_form check (linkedin_url is null or app.linkedin_url_valid(linkedin_url));

-- ---------- Writing ----------

-- Saves the signed-in user's display name, bio and LinkedIn link together, on their own row only. A
-- refusal changes nothing (R1); the checks run in the order of the form, so the message belongs to the
-- first field that is wrong.
-- * p_display_name: as app.set_display_name. Null keeps a name that was never set unset (the app then
--   shows the part of the address before the "@"); a name once set cannot be emptied, as today.
-- * p_bio: null clears it; otherwise app.list_text_valid with 160.
-- * p_linkedin: null clears it; otherwise only the exact form of app.linkedin_url_valid.
create function app.set_profile(p_display_name text, p_bio text, p_linkedin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_saved_name text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select p.display_name into v_saved_name from app.profiles p where p.id = uid for update;
  if (p_display_name is null and v_saved_name is not null)
     or (p_display_name is not null and not app.display_name_valid(p_display_name)) then
    raise exception 'Name must be 1 to 40 characters, without control characters' using errcode = '22023';
  end if;
  if p_bio is not null and not app.list_text_valid(p_bio, 160) then
    raise exception 'A bio must be 1 to 160 characters on one line, without control characters' using errcode = '22023';
  end if;
  if p_linkedin is not null and not app.linkedin_url_valid(p_linkedin) then
    raise exception 'Enter a LinkedIn profile link, like https://www.linkedin.com/in/your-name' using errcode = '22023';
  end if;
  update app.profiles
     set display_name = coalesce(p_display_name, display_name), bio = p_bio, linkedin_url = p_linkedin
   where id = uid;
end;
$$;

revoke all on function app.set_profile(text, text, text) from public, anon;
grant execute on function app.set_profile(text, text, text) to authenticated;

-- ---------- Reading ----------

-- One person's card for the signed-in user: their own, a contact's, or that of someone whose invitation
-- to the signed-in user is open (R43). No row in every other case (no such user, a stranger, someone who
-- only shares a list, the inviter before the answer, a removed contact), so the caller cannot tell
-- them apart. display_name is empty when not set (the app then shows the part of the address before
-- the "@"); photo_at is the photo's time, empty without one; time_zone comes from the person's settings.
-- The e-mail address is given in exactly these three cases, which are also the only ones with a row; it
-- is a column of its own so that a later, wider rule for the card cannot hand it out by accident.
create function app.profile_card(p_user uuid)
returns table (user_id uuid, display_name text, bio text, linkedin_url text, time_zone text, photo_at timestamptz, email text)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  allowed as (
    select me.uid, (
             me.uid = p_user
             or exists (
               select 1 from app.contacts c
                where c.user_a = least(me.uid, p_user) and c.user_b = greatest(me.uid, p_user)
             )
             or exists (
               select 1 from app.contact_invitations i where i.from_user = p_user and i.to_user = me.uid
             )
           ) as ok
      from me
     where me.uid is not null and p_user is not null
  )
  select u.id, p.display_name, p.bio, p.linkedin_url,
         coalesce((select s.time_zone from app.settings s where s.user_id = u.id), 'Europe/Lisbon'),
         ph.updated_at,
         u.email::text
    from allowed a
    join auth.users u on u.id = p_user
    join app.profiles p on p.id = u.id
    left join app.profile_photos ph on ph.user_id = u.id
   where a.ok;
$$;

revoke all on function app.profile_card(uuid) from public, anon;
grant execute on function app.profile_card(uuid) to authenticated;

commit;
