-- Build step 1, part 2: timed events (spec 02).
-- Run this file once in the Supabase SQL editor after 20261111000000_accounts.sql (see docs/setup.md).
--
-- Later steps add columns in new files (goal_id, location, all_day with first_day and last_day,
-- series_id, outlook_id). The checks below have names, so a later file can drop and replace one
-- (for example, all-day events will have no start_at and end_at).

create table app.events (
  id uuid primary key default gen_random_uuid(),
  -- The owner. Filled in by the database from the signed-in user; a user cannot choose it.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  may_overlap boolean not null default false,
  status text not null default 'planned',
  -- Where the event came from. Only the server's own code paths may set anything but 'app' (later steps).
  source text not null default 'app',
  -- Set by the trigger below on every insert and change; never by the user (R4).
  updated_at timestamptz not null default now(),

  constraint events_title_length check (char_length(title) between 1 and 100),
  constraint events_end_after_start check (end_at > start_at),
  constraint events_at_most_24_hours check (end_at - start_at <= interval '24 hours'),
  constraint events_status check (status in ('planned', 'done')),
  constraint events_source check (source in ('app', 'assistant', 'outlook'))
);

-- The week view asks for one user's events in a time range.
create index events_user_start on app.events (user_id, start_at);

-- updated_at: the database's clock, in whole milliseconds (so it survives the trip through JavaScript
-- unchanged), and always later than the previous value, even for two changes in the same millisecond.
create function app.set_events_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := greatest(
      date_trunc('milliseconds', pg_catalog.clock_timestamp()),
      old.updated_at + interval '1 millisecond'
    );
  else
    new.updated_at := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  end if;
  return new;
end;
$$;

revoke all on function app.set_events_updated_at() from public, anon, authenticated;

create trigger set_events_updated_at
  before insert or update on app.events
  for each row execute function app.set_events_updated_at();

-- Rights: nobody but the role "authenticated", and only these columns.
revoke all on app.events from public, anon, authenticated;
grant select, delete on app.events to authenticated;
grant insert (title, start_at, end_at, may_overlap) on app.events to authenticated;
grant update (title, start_at, end_at, may_overlap, status) on app.events to authenticated;
-- Not writable by users: id, user_id, source, updated_at.

-- Row-level security: each user reads and changes only their own events (R3).
alter table app.events enable row level security;

create policy "Users read their own events" on app.events
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users add their own events" on app.events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users change their own events" on app.events
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users delete their own events" on app.events
  for delete to authenticated
  using (user_id = (select auth.uid()));
