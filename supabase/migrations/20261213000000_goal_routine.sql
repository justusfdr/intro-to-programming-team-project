-- A goal's routine and goals without an end date (spec 41, decided in the team meeting of 16 November
-- 2026). Run once in the Supabase SQL editor after 20261212000000_saved_places.sql.
--
-- Additive only: the deployed main branch and teammates' older local builds run against the same
-- database and keep working unchanged. Every new column is empty or has a default, so an insert that
-- names only the old columns (title, deadline, auto_block, ...) still works and gives a goal exactly
-- like today's. Nothing existing changes its meaning; no policy changes (row-level security already
-- limits goals to their owner).
--
--   * category, category_other: what kind of goal it is ("sport", "uni", "work", "personal", "other"),
--     and the person's own word for "other" ("Music").
--   * session_minutes: how long one session usually is, 15 to 240 minutes in steps of 15.
--   * day_part: when in the day it suits ("morning", "afternoon", "evening"); empty means any time.
--   * avoid_days: the weekdays it is never done on, as digits in rising order, Monday = 1 to Sunday = 7:
--     '' none, '5' never on Fridays, '67' never on weekends. Never all seven.
--   * location: where it is done, like an event's location; empty means at home or nowhere in particular.
--   * open_ended: the goal has no end date. The deadline column stays "not null", because older
--     versions read every goal's deadline as a date: an open-ended goal keeps a placeholder there (the
--     user's today plus 364 days, written by the server when the goal becomes open-ended). Only older
--     versions ever read it; the new code treats an open-ended goal as having no deadline.

alter table app.goals
  add column category text,
  add column category_other text,
  add column session_minutes integer,
  add column day_part text,
  add column avoid_days text not null default '',
  add column location text,
  add column open_ended boolean not null default false;

alter table app.goals
  add constraint goals_category check (
    category is null or category in ('sport', 'uni', 'work', 'personal', 'other')
  ),
  -- Only with the category "other"; one line, 1 to 30 characters, no spaces at either end, no control
  -- or invisible characters (the rule of a profile's bio, app.list_text_valid). The coalesce makes an
  -- empty category count as "not other" (a check that comes out empty would otherwise pass).
  add constraint goals_category_other check (
    category_other is null or coalesce(category = 'other' and app.list_text_valid(category_other, 30), false)
  ),
  add constraint goals_session_minutes check (
    session_minutes is null or (session_minutes between 15 and 240 and session_minutes % 15 = 0)
  ),
  add constraint goals_day_part check (
    day_part is null or day_part in ('morning', 'afternoon', 'evening')
  ),
  -- Each digit at most once and only in rising order; the length forbids all seven.
  add constraint goals_avoid_days check (
    avoid_days ~ '^1?2?3?4?5?6?7?$' and char_length(avoid_days) <= 6
  ),
  -- Like an event's location (1 to 200 characters), and trimmed.
  add constraint goals_location check (
    location is null or (location = btrim(location) and char_length(location) between 1 and 200)
  );

-- ---------- Rights ----------
-- Users write the routine of their own goals (row-level security keeps it to their own rows).
grant insert (category, category_other, session_minutes, day_part, avoid_days, location, open_ended),
      update (category, category_other, session_minutes, day_part, avoid_days, location, open_ended)
   on app.goals to authenticated;
