-- Build step 3, part 2: the blocker (spec 05): the block list, blocked attempts, and when the
-- extension last asked. Run this file once in the Supabase SQL editor after the focus sessions file.

-- A domain as our server cleans it (R17): lower case, labels of letters, digits and hyphens,
-- at least one dot, no scheme, path, port or "www.".
create function app.is_clean_domain(domain text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select char_length(domain) <= 253
     and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$'
     and domain !~ '^www\.'
$$;

grant execute on function app.is_clean_domain(text) to authenticated;

create table app.blocked_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  domain text not null,
  created_at timestamptz not null default now(),

  constraint blocked_sites_clean_domain check (app.is_clean_domain(domain)),
  -- R17: no duplicates.
  constraint blocked_sites_once_per_user unique (user_id, domain)
);

-- R17: at most 50 sites per user. The lock makes two additions at the same moment take turns.
create function app.check_blocked_sites_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('blocked_sites:' || new.user_id::text));
  if (select count(*) from app.blocked_sites where user_id = new.user_id) >= 50 then
    raise exception 'You can block at most 50 sites' using errcode = '23514', constraint = 'blocked_sites_at_most_50';
  end if;
  return new;
end;
$$;

revoke all on function app.check_blocked_sites_limit() from public, anon, authenticated;

create trigger blocked_sites_at_most_50
  before insert on app.blocked_sites
  for each row execute function app.check_blocked_sites_limit();

-- A visit to a blocked site that the extension stopped. It keeps the domain as text, so removing
-- the site from the list keeps its past attempts (ontology: remove_blocked_site).
create table app.blocked_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  domain text not null,
  attempted_at timestamptz not null,
  -- When our server stored it (the extension may send attempts later, R16).
  created_at timestamptz not null default now(),

  constraint blocked_attempts_clean_domain check (app.is_clean_domain(domain))
);

create index blocked_attempts_user_time on app.blocked_attempts (user_id, attempted_at);
create index blocked_attempts_user_stored on app.blocked_attempts (user_id, created_at);

-- At most 500 attempts are stored per user and day; more are dropped without an error.
-- 500 is more than a real person reaches (one stopped visit a minute through 8 focused hours is 480),
-- and it keeps a forged or looping extension from filling the database (about 50 kB a day at most).
create function app.drop_attempts_over_daily_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('blocked_attempts:' || new.user_id::text));
  if (select count(*) from app.blocked_attempts
       where user_id = new.user_id and created_at >= pg_catalog.date_trunc('day', pg_catalog.now())) >= 500 then
    return null; -- dropped silently
  end if;
  return new;
end;
$$;

revoke all on function app.drop_attempts_over_daily_cap() from public, anon, authenticated;

create trigger blocked_attempts_daily_cap
  before insert on app.blocked_attempts
  for each row execute function app.drop_attempts_over_daily_cap();

-- When the extension last asked (R18). Users never write their profile; this function sets only the
-- signed-in user's own value, to the database's time.
alter table app.profiles add column extension_seen_at timestamptz;

create function app.mark_extension_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update app.profiles set extension_seen_at = pg_catalog.now() where id = auth.uid();
$$;

revoke all on function app.mark_extension_seen() from public, anon;
grant execute on function app.mark_extension_seen() to authenticated;

-- The default block list (ontology, fixed content): for every new account, written by the sign-up
-- trigger together with the profile and settings, and once for the accounts that exist now.
create or replace function app.create_rows_for_new_user()
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
  insert into app.blocked_sites (user_id, domain)
  select new.id, d
    from unnest(array['youtube.com', 'instagram.com', 'tiktok.com', 'x.com', 'reddit.com', 'facebook.com']) as d;
  return new;
end;
$$;

insert into app.blocked_sites (user_id, domain)
select p.id, d
  from app.profiles p
 cross join unnest(array['youtube.com', 'instagram.com', 'tiktok.com', 'x.com', 'reddit.com', 'facebook.com']) as d
on conflict (user_id, domain) do nothing;

-- Rights: only the role "authenticated", and only these columns.
revoke all on app.blocked_sites, app.blocked_attempts from public, anon, authenticated;
grant select, delete on app.blocked_sites to authenticated;
grant insert (domain) on app.blocked_sites to authenticated;
grant select on app.blocked_attempts to authenticated;
grant insert (domain, attempted_at) on app.blocked_attempts to authenticated;
-- Attempts cannot be changed or deleted by users (they go with the account).

alter table app.blocked_sites enable row level security;
alter table app.blocked_attempts enable row level security;

create policy "Users read their own blocked sites" on app.blocked_sites for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own blocked sites" on app.blocked_sites for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users delete their own blocked sites" on app.blocked_sites for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their own attempts" on app.blocked_attempts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own attempts" on app.blocked_attempts for insert to authenticated
  with check (user_id = (select auth.uid()));
