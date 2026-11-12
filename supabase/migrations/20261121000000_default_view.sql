-- The calendar's default view (spec 14, branch prototype-style). Run once in the Supabase SQL editor
-- after the goal style and demo file.
--
-- Additive only: the main branch runs against the same database. The new column has a default, nothing
-- existing is removed or made stricter.

-- Which view the calendar opens with when the address names none: one day, the week (as before) or the month.
alter table app.settings
  add column default_view text not null default 'week';

alter table app.settings
  add constraint settings_default_view check (default_view in ('day', 'week', 'month'));

-- Users may change it on their own row (row-level security from the accounts file).
grant update (default_view) on app.settings to authenticated;
