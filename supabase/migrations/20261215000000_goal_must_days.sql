-- The weekdays a goal always happens on (the question "Which days for sure?" of the new-goal questions).
-- Run once in the Supabase SQL editor after 20261214000000_coach_goal_place.sql.
--
-- Additive only, like 20261213000000_goal_routine.sql: the new column has a default, so older builds
-- that do not know it keep working and their goals have no such days.
--
--   * must_days: the weekdays it is always done on, as digits in rising order, Monday = 1 to Sunday = 7:
--     '' none, '1' always on Mondays, '135' Monday, Wednesday and Friday. Never a day of avoid_days.
--     How many there may be (at most the times a week) is checked by the server, which knows the rules.

alter table app.goals
  add column must_days text not null default '';

alter table app.goals
  -- Each digit at most once, in rising order, and no day that is also ruled out.
  add constraint goals_must_days check (
    must_days ~ '^1?2?3?4?5?6?7?$'
    -- translate() drops every ruled-out digit: when nothing is dropped, no day is in both.
    and translate(must_days, avoid_days, '') = must_days
  );

grant insert (must_days), update (must_days) on app.goals to authenticated;
