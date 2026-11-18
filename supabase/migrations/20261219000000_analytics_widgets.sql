-- The widgets of the Analytics page (spec 49, branch 49-analytics-tabs). Run once in the Supabase SQL editor.
--
-- Additive only: the main branch runs against the same database. The new column is empty (null) for
-- everyone, which means "the standard layout"; nothing existing is removed or made stricter.

-- The user's Analytics layout: null (none saved) or a JSON object with one list of widgets per tab.
-- Which tabs, widgets and sizes are allowed, and that each tab fits on one screen, is checked by the
-- server (src/lib/analytics/layout.ts); the database only keeps the shape and the size small.
alter table app.settings
  add column analytics_widgets jsonb;

alter table app.settings
  add constraint settings_analytics_widgets check (
    analytics_widgets is null
    or (jsonb_typeof(analytics_widgets) = 'object' and length(analytics_widgets::text) <= 4000)
  );

-- Users may change it on their own row (row-level security from the accounts file).
grant update (analytics_widgets) on app.settings to authenticated;
