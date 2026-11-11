-- Test only. Recreates the small part of a Supabase database that our migrations rely on,
-- so the same migration files can run on the temporary test database.
-- Never run this file in Supabase: these objects already exist there.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

-- Supabase grants new tables to the API roles by default. We copy that here (even more widely,
-- for every schema) so the tests prove that our migrations take those rights away again.
alter default privileges grant all on tables to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

-- The columns of Supabase's user table that our code and migrations use.
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Same definition as Supabase's auth.uid(): the user id from the request's JWT claims.
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
