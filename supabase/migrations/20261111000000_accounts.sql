-- Build step 1: accounts.
-- Creates the schema "app" with one profile row and one settings row per user.
-- Run this file once in the Supabase SQL editor (see docs/setup.md). The tests run the same file.
--
-- Security model (see docs/ontology.md, R3 and R6):
-- * Our tables live in the schema "app", which Supabase's data API does not expose.
--   The browser never talks to the database; only our server does.
-- * The server runs every query as the role "authenticated" with the signed-in user's id,
--   so row-level security limits each user to their own rows.
-- * The role "authenticated" may read its profile but never write it. The plan is set only by the server
--   with its own privileged connection (step 6, payment).

create schema app;

-- Nobody gets anything in this schema unless granted below.
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated;

-- One row per user. The account's email and confirmation status stay in Supabase Auth (auth.users).
create table app.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

-- One row per user: time zone and travel details (ontology section 3, settings).
create table app.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  time_zone text not null default 'Europe/Lisbon' check (char_length(time_zone) between 1 and 64),
  home_address text,
  travel_mode text not null default 'driving' check (travel_mode in ('driving', 'cycling', 'walking')),
  travel_buffer_minutes integer not null default 10 check (travel_buffer_minutes between 0 and 120)
);

-- Take away any rights that default privileges may have handed out, then grant only what is needed.
revoke all on all tables in schema app from public, anon, authenticated;

grant select on app.profiles to authenticated;
-- No insert, update or delete on profiles: the plan can never be written by a user (R6).

grant select on app.settings to authenticated;
grant update (time_zone, home_address, travel_mode, travel_buffer_minutes) on app.settings to authenticated;
-- No insert or delete: the row is created at sign-up and removed with the account.

-- Row-level security: each user sees and changes only their own rows (R3).
alter table app.profiles enable row level security;
alter table app.settings enable row level security;

create policy "Users read their own profile" on app.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "Users read their own settings" on app.settings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users change their own settings" on app.settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- When Supabase Auth creates a user, create the profile and settings rows in the same transaction.
-- So a user can never exist without both rows. The time zone comes from the sign-up form
-- (user metadata "time_zone"); if it is missing or not a known time zone, we use Europe/Lisbon.
create function app.create_rows_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := new.raw_user_meta_data ->> 'time_zone';
  chosen text := 'Europe/Lisbon';
begin
  if requested is not null
     and exists (select 1 from pg_catalog.pg_timezone_names where name = requested) then
    chosen := requested;
  end if;

  insert into app.profiles (id) values (new.id);
  insert into app.settings (user_id, time_zone) values (new.id, chosen);
  return new;
end;
$$;

revoke all on function app.create_rows_for_new_user() from public, anon, authenticated;

create trigger create_rows_for_new_user
  after insert on auth.users
  for each row execute function app.create_rows_for_new_user();
