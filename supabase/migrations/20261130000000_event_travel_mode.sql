-- How the user gets to one event (changed on 13 November 2026). Run once in the Supabase SQL editor after
-- 20261129000000_travel_mode_transit.sql.
--
-- Additive only: the main branch runs against the same database. The new column is empty ("use my standard
-- from the settings") for every event saved before. Like the location, it may be written when an event is
-- created and changed later only through the narrow function below.

alter table app.events
  add column travel_mode text,
  add constraint events_travel_mode_check check (travel_mode is null or travel_mode in ('driving', 'cycling', 'walking', 'transit'));

grant insert (travel_mode) on app.events to authenticated;

-- Sets the travel mode of one of the signed-in user's own events; null means "use my standard".
-- Another user's event and an unknown id are "Not found" (R3); an Outlook event is refused (R11).
create function app.set_event_travel_mode(event_id uuid, new_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  found_source text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select source into found_source from app.events where id = event_id and user_id = uid for update;
  if found_source is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if found_source = 'outlook' then raise exception 'Change this event in Outlook' using errcode = '42501'; end if;
  update app.events set travel_mode = new_mode where id = event_id and user_id = uid;
end;
$$;

revoke all on function app.set_event_travel_mode(uuid, text) from public, anon;
grant execute on function app.set_event_travel_mode(uuid, text) to authenticated;
