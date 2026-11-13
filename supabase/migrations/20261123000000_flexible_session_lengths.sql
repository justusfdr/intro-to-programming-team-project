-- Any session length from 1 to 240 minutes (R12, changed on 13 November 2026). Run once in the
-- Supabase SQL editor after the event location file.
--
-- Before, a session lasted exactly 15, 30, 60, 90 or 120 minutes. The app still suggests those, but
-- the user can type in any whole number of minutes from 1 to 240. Only the check is widened: every
-- saved session already lies within the new range, so nothing existing breaks.

alter table app.focus_sessions drop constraint focus_sessions_length;

-- R12: a whole number of minutes from 1 to 240 (the column is an integer, so whole numbers only).
alter table app.focus_sessions add constraint focus_sessions_length
  check (planned_minutes between 1 and 240);
