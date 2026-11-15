-- Sharing a calendar and the focus chart with a contact (spec 29, branch 29-sharing-calendar), stage 2 of
-- sharing. Run once in the Supabase SQL editor after the earlier files.
--
-- Additive only: the code on main runs against the same database and must keep working unchanged.
-- One new table and functions. Nothing existing is removed, renamed, made stricter or loosened: the
-- policies of app.events, app.focus_sessions, app.settings and every other table stay exactly as they
-- are ("own rows only"). Another user's rows are read ONLY inside the security definer functions
-- below, which check the share first and hand out a reduced shape (ontology R47 to R51).
--
-- What leaves a user's rows, and to whom:
-- * To a contact the owner shares their calendar with at "busy": for each event the start and end (or
--   the first and last day and the all-day mark), overlapping blocks merged. Nothing else.
-- * At "details": also each event's title and place.
-- * To a contact the owner shares their focus chart with: per week of the current week and the 7 before
--   the focused minutes and the number of finished sessions, and this week's focused minutes per day.
-- * Never: notes, guests, organizer, to-dos, goal, travel mode, status, source, Outlook ids, the
--   series, ids of events or sessions, updated_at, demo events, ratings, session times, blocked sites.
-- Everything is computed from the owner's rows at the moment of the request; nothing is copied, so a
-- withdrawn share or a removed contact shows nothing from the next request on.

-- ---------- The table ----------

-- One row per owner and viewer: what the owner shares with that contact. It hangs on the contact row,
-- so removing the contact (either side) ends every share between the two at once, in both directions.
-- No row means nothing is shared. Written only by app.set_share (by the owner).
create table app.shares (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references app.contacts (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  viewer uuid not null references auth.users (id) on delete cascade,
  calendar text not null default 'none',
  focus boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint shares_calendar check (calendar in ('none', 'busy', 'details')),
  constraint shares_pair unique (owner, viewer),
  constraint shares_not_self check (owner <> viewer)
);

create index shares_viewer on app.shares (viewer);
create index shares_contact on app.shares (contact_id);

-- The two people of a share are always the two people of its contact row (also for rows the table's
-- owner writes by hand).
create function app.check_share_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.contacts c
     where c.id = new.contact_id
       and c.user_a = least(new.owner, new.viewer)
       and c.user_b = greatest(new.owner, new.viewer)
  ) then
    raise exception 'A share belongs to the two people of its contact' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app.check_share_contact() from public, anon, authenticated;

create trigger check_share_contact
  before insert or update on app.shares
  for each row execute function app.check_share_contact();

-- ---------- Rights and row-level security ----------

-- Take away the rights that default privileges may have handed out, then grant only reading.
revoke all on app.shares from public, anon, authenticated;
alter table app.shares enable row level security;

-- The owner sees what they share; the viewer sees what is shared with them. Nobody else.
grant select on app.shares to authenticated;
create policy "Owner and viewer read a share" on app.shares
  for select to authenticated
  using (owner = (select auth.uid()) or viewer = (select auth.uid()));

-- No insert, update or delete for "authenticated": only app.set_share writes.

-- ---------- Setting a share ----------

-- The signed-in user sets what they share with the other person of one of their contacts: the calendar
-- ('none', 'busy' or 'details') and the focus chart (true or false). The caller is always the owner;
-- the other person of the contact row is the viewer, so nobody can write a share for themselves.
-- Sharing nothing removes the row. "Not found" for a contact row that is not the caller's.
create function app.set_share(p_contact_id uuid, p_calendar text, p_focus boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_viewer uuid;
  v_contact uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select c.id, case when c.user_a = uid then c.user_b else c.user_a end
    into v_contact, v_viewer
    from app.contacts c
   where c.id = p_contact_id and (c.user_a = uid or c.user_b = uid)
   for update;
  if v_contact is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if p_calendar is null or p_calendar not in ('none', 'busy', 'details') or p_focus is null then
    raise exception 'Choose what to share' using errcode = '22023';
  end if;
  if p_calendar = 'none' and not p_focus then
    delete from app.shares s where s.owner = uid and s.viewer = v_viewer;
    return;
  end if;
  insert into app.shares (contact_id, owner, viewer, calendar, focus, updated_at)
  values (v_contact, uid, v_viewer, p_calendar, p_focus, pg_catalog.clock_timestamp())
  on conflict (owner, viewer) do update
    set contact_id = excluded.contact_id, calendar = excluded.calendar, focus = excluded.focus, updated_at = excluded.updated_at;
end;
$$;

revoke all on function app.set_share(uuid, text, boolean) from public, anon;
grant execute on function app.set_share(uuid, text, boolean) to authenticated;

-- ---------- The overview (People page) ----------

-- Per contact of the signed-in user: what they share ('out', the user is the owner) and what is shared
-- with them ('in', the user is the viewer). Only rows that exist; a missing row means nothing.
-- user_id is the other person; contact_id the contact row.
create function app.shares_overview()
returns table (direction text, contact_id uuid, user_id uuid, calendar text, focus boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.owner = me.uid then 'out' else 'in' end,
         s.contact_id,
         case when s.owner = me.uid then s.viewer else s.owner end,
         s.calendar,
         s.focus
    from (select auth.uid() as uid) me
    join app.shares s on me.uid in (s.owner, s.viewer)
    join app.contacts c on c.id = s.contact_id
   where me.uid is not null;
$$;

revoke all on function app.shares_overview() from public, anon;
grant execute on function app.shares_overview() to authenticated;

-- ---------- Reading a shared calendar ----------

-- What the signed-in user may see of p_owner's calendar: 'busy', 'details', or null when nothing (no
-- share, calendar 'none', not contacts any more, not signed in). Internal.
create function app.calendar_level(p_owner uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.calendar
    from app.shares s
   where (select auth.uid()) is not null
     and s.owner = p_owner
     and s.viewer = (select auth.uid())
     and s.calendar in ('busy', 'details')
     and app.is_contact(p_owner, (select auth.uid()));
$$;

revoke all on function app.calendar_level(uuid) from public, anon, authenticated;

-- p_owner's events between p_from and p_to (at most 62 days) in the reduced shape of R48, for the
-- signed-in user. Every row says its level. Timed events: all_day false, start_at and end_at (at "busy"
-- overlapping blocks are merged into one); all-day events: all_day true, first_day and last_day (merged
-- the same way at "busy"). title and location only at "details", else null. Never demo events.
-- "Not found" when the user may not see this calendar (no share, not a contact, no such user: the same
-- answer). The owner's rows are read here, as the function's owner; app.events' policies stay as they are.
create function app.shared_calendar(p_owner uuid, p_from timestamptz, p_to timestamptz)
returns table (
  level text,
  all_day boolean,
  start_at timestamptz,
  end_at timestamptz,
  first_day date,
  last_day date,
  title text,
  location text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_level text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  v_level := app.calendar_level(p_owner);
  if v_level is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '62 days' then
    raise exception 'Choose at most 62 days' using errcode = '22023';
  end if;

  if v_level = 'details' then
    return query
      select 'details'::text, e.all_day, e.start_at, e.end_at, e.first_day, e.last_day, e.title, e.location
        from app.events e
       where e.user_id = p_owner
         and not e.demo
         and (
           (not e.all_day and e.start_at < p_to and e.end_at > p_from)
           or (e.all_day and e.first_day <= (p_to at time zone 'UTC')::date and e.last_day >= (p_from at time zone 'UTC')::date - 1)
         )
       order by e.all_day, e.start_at, e.first_day, e.last_day, e.end_at;
    return;
  end if;

  -- 'busy': only the times, overlapping (or touching) blocks merged, so not even the number of events
  -- shows. Islands of overlapping intervals: a new island starts where an interval begins after every
  -- earlier one has ended.
  return query
    with timed as (
      select e.start_at as s, e.end_at as f
        from app.events e
       where e.user_id = p_owner and not e.demo and not e.all_day
         and e.start_at < p_to and e.end_at > p_from
    ), timed_marked as (
      select s, f, max(f) over (order by s, f rows between unbounded preceding and 1 preceding) as before_max
        from timed
    ), timed_groups as (
      select s, f, sum(case when before_max is null or s > before_max then 1 else 0 end) over (order by s, f) as grp
        from timed_marked
    ), days as (
      select e.first_day as s, e.last_day + 1 as f
        from app.events e
       where e.user_id = p_owner and not e.demo and e.all_day
         and e.first_day <= (p_to at time zone 'UTC')::date and e.last_day >= (p_from at time zone 'UTC')::date - 1
    ), days_marked as (
      select s, f, max(f) over (order by s, f rows between unbounded preceding and 1 preceding) as before_max
        from days
    ), days_groups as (
      select s, f, sum(case when before_max is null or s > before_max then 1 else 0 end) over (order by s, f) as grp
        from days_marked
    )
    select 'busy'::text, false, min(g.s), max(g.f), null::date, null::date, null::text, null::text
      from timed_groups g group by g.grp
    union all
    select 'busy'::text, true, null::timestamptz, null::timestamptz, min(g.s), max(g.f) - 1, null::text, null::text
      from days_groups g group by g.grp
    order by 2, 3, 5;
end;
$$;

revoke all on function app.shared_calendar(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function app.shared_calendar(uuid, timestamptz, timestamptz) to authenticated;

-- ---------- Reading a shared focus chart ----------

-- p_owner's focus chart at the moment p_now, in the owner's time zone with weeks from Monday (R2):
-- kind 'week' for the current week and the 7 before (day = that week's Monday), kind 'day' for each day
-- of the current week. focused_minutes uses R13's definition, the same as the Analytics page
-- (src/lib/focus/session-time.ts, focusedMinutes): end − start − paused seconds, the seconds rounded
-- down, then whole minutes rounded down; a session belongs to the day it starts. Finished sessions
-- count, and running ones whose planned length has passed (they finish by themselves at start +
-- planned minutes + paused seconds, R13). Internal: no right for "authenticated"; app.shared_focus
-- calls it with the database's clock after checking the share.
create function app.focus_chart_of(p_owner uuid, p_now timestamptz)
returns table (kind text, day date, focused_minutes integer, sessions integer)
language sql
stable
security definer
set search_path = ''
as $$
  with zone as (
    select coalesce((select s.time_zone from app.settings s where s.user_id = p_owner), 'Europe/Lisbon') as tz
  ), today as (
    select (p_now at time zone zone.tz)::date as d, zone.tz from zone
  ), week as (
    select (today.d - (extract(isodow from today.d)::integer - 1)) as monday, today.tz from today
  ), done as (
    select (f.started_at at time zone week.tz)::date as local_day,
           greatest(
             0,
             pg_catalog.floor(extract(epoch from (
               case when f.status = 'finished' then f.ended_at
                    else f.started_at + make_interval(mins => f.planned_minutes, secs => f.paused_seconds) end
               - f.started_at
             )))::integer - f.paused_seconds
           ) / 60 as minutes
      from app.focus_sessions f, week
     where f.user_id = p_owner
       and (
         f.status = 'finished'
         or (f.status = 'running' and f.started_at + make_interval(mins => f.planned_minutes, secs => f.paused_seconds) <= p_now)
       )
       and f.started_at >= ((week.monday - 49)::timestamp at time zone week.tz)
       and f.started_at < ((week.monday + 7)::timestamp at time zone week.tz)
  )
  select 'week'::text, w.monday, coalesce(sum(done.minutes), 0)::integer, count(done.minutes)::integer
    from (select week.monday - 7 * i as monday from week, generate_series(0, 7) i) w
    left join done on done.local_day >= w.monday and done.local_day < w.monday + 7
   group by w.monday
  union all
  select 'day'::text, d.day, coalesce(sum(done.minutes), 0)::integer, count(done.minutes)::integer
    from (select week.monday + i as day from week, generate_series(0, 6) i) d
    left join done on done.local_day = d.day
   group by d.day
  order by 1, 2;
$$;

revoke all on function app.focus_chart_of(uuid, timestamptz) from public, anon, authenticated;

-- p_owner's focus chart for the signed-in user (R49), only when p_owner shares it with them and they
-- are still contacts. "Not found" otherwise (no share, not a contact, no such user: the same answer).
create function app.shared_focus(p_owner uuid)
returns table (kind text, day date, focused_minutes integer, sessions integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (
    select 1 from app.shares s
     where s.owner = p_owner and s.viewer = uid and s.focus and app.is_contact(p_owner, uid)
  ) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return query select * from app.focus_chart_of(p_owner, pg_catalog.now());
end;
$$;

revoke all on function app.shared_focus(uuid) from public, anon;
grant execute on function app.shared_focus(uuid) to authenticated;
