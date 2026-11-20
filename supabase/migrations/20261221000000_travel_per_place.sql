-- How the user gets to each place, and the buffer for it (asked for by Lucas on 20 Nov 2026). Run once in
-- the Supabase SQL editor after 20261220000000_accepted_invite_details.sql. Not applied to the live
-- database by the agent that wrote it.
--
-- Additive only: the code on main runs against the same database and keeps working unchanged. Four new
-- nullable columns and their checks; nothing existing is removed, renamed, made stricter or loosened.
--   1. app.places.travel_mode / travel_buffer_minutes: how the user gets to this saved place ("Gym": walking,
--      5 min). Empty means "as Other": the settings' travel_mode / travel_buffer_minutes.
--   2. app.settings.home_travel_mode / home_travel_buffer_minutes: the same for the home address.
-- The settings' travel_mode and travel_buffer_minutes stay what they were; the app now calls them "Other":
-- every address that is neither home nor a saved place.

alter table app.places
  add column travel_mode text,
  add column travel_buffer_minutes integer,
  add constraint places_travel_mode check (travel_mode is null or travel_mode in ('driving', 'cycling', 'walking', 'transit')),
  add constraint places_travel_buffer check (travel_buffer_minutes is null or travel_buffer_minutes between 0 and 120);

grant insert (travel_mode, travel_buffer_minutes), update (travel_mode, travel_buffer_minutes) on app.places to authenticated;

alter table app.settings
  add column home_travel_mode text,
  add column home_travel_buffer_minutes integer,
  add constraint settings_home_travel_mode check (home_travel_mode is null or home_travel_mode in ('driving', 'cycling', 'walking', 'transit')),
  add constraint settings_home_travel_buffer check (home_travel_buffer_minutes is null or home_travel_buffer_minutes between 0 and 120);

grant update (home_travel_mode, home_travel_buffer_minutes) on app.settings to authenticated;
