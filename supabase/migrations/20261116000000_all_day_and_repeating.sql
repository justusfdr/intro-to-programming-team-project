-- Build step 5, part 1: all-day and repeating events (spec 07). Changes the events table from the
-- events file without rewriting it. Run once in the Supabase SQL editor after the blocker file.
--
-- A timed event has start_at and end_at and no days; an all-day event has first_day and last_day and
-- no times (R29). The older checks on start and end stay: they pass when the times are empty.

alter table app.events
  alter column start_at drop not null,
  alter column end_at drop not null,
  add column all_day boolean not null default false,
  add column first_day date,
  add column last_day date,
  -- Events of one series share it (R28). No repeat rule is stored.
  add column series_id uuid;

alter table app.events
  add constraint events_timed_or_all_day check (
    (not all_day and start_at is not null and end_at is not null and first_day is null and last_day is null)
    or (all_day and start_at is null and end_at is null and first_day is not null and last_day is not null)
  ),
  add constraint events_last_day_after_first check (last_day >= first_day),
  -- At most 31 days, first and last day included.
  add constraint events_at_most_31_days check (last_day - first_day <= 30),
  add constraint events_all_day_no_goal check (not all_day or goal_id is null),
  add constraint events_all_day_not_done check (not all_day or status = 'planned'),
  add constraint events_all_day_no_series check (not all_day or series_id is null);

create index events_user_days on app.events (user_id, first_day, last_day) where all_day;
create index events_user_series on app.events (user_id, series_id) where series_id is not null;

-- Rights for the new columns: users may set them when creating; afterwards only the days (and switch
-- between timed and all-day). A series is fixed once created.
grant insert (all_day, first_day, last_day, series_id) on app.events to authenticated;
grant update (all_day, first_day, last_day) on app.events to authenticated;
