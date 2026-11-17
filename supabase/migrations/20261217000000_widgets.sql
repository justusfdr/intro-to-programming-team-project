-- The widgets in the sidebar (spec 47, branch 45-sidebar-widgets). Run once in the Supabase SQL editor.
--
-- Additive only: the main branch runs against the same database. The new column is empty (null) for
-- everyone, which means "the standard list"; nothing existing is removed or made stricter.

-- The user's list of widgets: null (none saved) or a JSON list of at most 18 widgets (a 3 x 6 grid has
-- 18 fields). Which kinds and sizes are allowed is checked by the server (R47); the database only keeps
-- the shape and the size small.
alter table app.settings
  add column widgets jsonb;

alter table app.settings
  add constraint settings_widgets check (
    widgets is null or (jsonb_typeof(widgets) = 'array' and jsonb_array_length(widgets) <= 18)
  );

-- Users may change it on their own row (row-level security from the accounts file).
grant update (widgets) on app.settings to authenticated;
