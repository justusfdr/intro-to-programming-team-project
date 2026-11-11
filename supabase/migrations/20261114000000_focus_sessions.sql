-- Build step 3, part 1: focus sessions (spec 04).
-- Run this file once in the Supabase SQL editor after the goals file (see docs/setup.md).
--
-- The times of a session (started_at, paused_at, ended_at) are written by our server from its clock,
-- never taken from the browser. The database checks that they fit together.

-- Target of the two-column link below: a session may only point to an event of the same user.
alter table app.events add constraint events_owner_and_id unique (user_id, id);

create table app.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id uuid,
  planned_minutes integer not null,
  status text not null default 'running',
  started_at timestamptz not null,
  -- Set while paused, empty otherwise.
  paused_at timestamptz,
  -- Seconds spent paused so far (resumed pauses only).
  paused_seconds integer not null default 0,
  -- Set when finished, empty before.
  ended_at timestamptz,
  rating integer,

  constraint focus_sessions_event_of_same_user foreign key (user_id, event_id)
    references app.events (user_id, id) on delete set null (event_id),
  -- R12: exactly these lengths.
  constraint focus_sessions_length check (planned_minutes in (15, 30, 60, 90, 120)),
  constraint focus_sessions_status check (status in ('running', 'paused', 'finished')),
  constraint focus_sessions_paused_seconds check (paused_seconds >= 0),
  constraint focus_sessions_paused_at check ((status = 'paused') = (paused_at is not null)),
  constraint focus_sessions_ended_at check ((status = 'finished') = (ended_at is not null)),
  constraint focus_sessions_order check (ended_at is null or ended_at >= started_at),
  -- R14: a whole number from 0 to 5, only on a finished session; empty is not 0.
  constraint focus_sessions_rating check (rating is null or (rating between 0 and 5 and status = 'finished'))
);

-- R4: at most one running or paused session per user, also when two devices start at once.
create unique index focus_sessions_one_active on app.focus_sessions (user_id) where status in ('running', 'paused');
create index focus_sessions_user_started on app.focus_sessions (user_id, started_at);

-- Rights: only the role "authenticated", and only these columns.
revoke all on app.focus_sessions from public, anon, authenticated;
grant select, delete on app.focus_sessions to authenticated;
grant insert (event_id, planned_minutes, started_at) on app.focus_sessions to authenticated;
grant update (status, paused_at, paused_seconds, ended_at, rating) on app.focus_sessions to authenticated;
-- Not writable by users: id, user_id, and a session's event, length and start once it exists.

alter table app.focus_sessions enable row level security;

create policy "Users read their own sessions" on app.focus_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own sessions" on app.focus_sessions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users change their own sessions" on app.focus_sessions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their own sessions" on app.focus_sessions for delete to authenticated
  using (user_id = (select auth.uid()));
