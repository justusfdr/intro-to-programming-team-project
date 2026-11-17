-- A goal's session may last 1 minute to 12 hours, to the minute (was 15 minutes to 4 hours in steps of
-- 15). Run once in the Supabase SQL editor after 20261215000000_goal_must_days.sql.
--
-- Only widens the check: every value allowed before is still allowed, so the deployed app and older
-- builds keep working.

alter table app.goals drop constraint goals_session_minutes;

alter table app.goals
  add constraint goals_session_minutes check (
    session_minutes is null or session_minutes between 1 and 720
  );
