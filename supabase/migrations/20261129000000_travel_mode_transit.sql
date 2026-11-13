-- Public transport as a way of getting to events (changed on 13 November 2026). Run once in the
-- Supabase SQL editor after the earlier migrations.
--
-- The travel mode may now also be 'transit' (train, bus, metro and tram). Only the check is widened:
-- every mode saved before stays valid.
alter table app.settings drop constraint settings_travel_mode_check;
alter table app.settings add constraint settings_travel_mode_check
  check (travel_mode in ('driving', 'cycling', 'walking', 'transit'));
