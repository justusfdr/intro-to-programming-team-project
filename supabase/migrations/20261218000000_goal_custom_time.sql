-- A goal's own time window ("Custom" in "When does it suit you best?"). Run once in the Supabase SQL
-- editor after 20261217000000_widgets.sql.
--
-- Additive only: both new columns are empty by default, so the deployed app and older builds keep
-- working and their goals have no own window.
--
--   * day_from_min, day_until_min: the window as minutes after midnight, from (included) to until
--     (not included), e.g. 390 and 480 for 6:30 to 8:00. Both empty, or both set with from < until
--     within one day. Never together with day_part (morning, afternoon, evening).
--     Whether the window is long enough for one session and inside the visible hours is checked by
--     the server and the screens, which know the session length and the settings.

alter table app.goals
  add column day_from_min integer,
  add column day_until_min integer;

alter table app.goals
  -- The coalesce makes a half window (one of the two empty) fail instead of passing as "unknown".
  add constraint goals_day_window check (
    (day_from_min is null and day_until_min is null)
    or coalesce(day_from_min between 0 and 1439 and day_until_min between 1 and 1440 and day_from_min < day_until_min and day_part is null, false)
  );

grant insert (day_from_min, day_until_min), update (day_from_min, day_until_min) on app.goals to authenticated;
