-- Any session length from 1 minute to 23 h 59 min (R12, changed on 13 November 2026). Run once in the
-- Supabase SQL editor after the earlier migrations.
--
-- The Focus page's "Custom" length is now a wheel of hours (0 to 23) and minutes (0 to 59), as in the
-- Clock app's timer, so a session can last up to 23 h 59 min (1439 minutes). Only the check is
-- widened: every session saved before stays valid.
alter table app.focus_sessions drop constraint focus_sessions_length;
alter table app.focus_sessions add constraint focus_sessions_length
  -- R12: a whole number of minutes from 1 to 1439 (the column is an integer, so whole numbers only).
  check (planned_minutes between 1 and 1439);
