-- Where an app event takes place (spec 16, branch prototype-style). Run once in the Supabase SQL editor
-- after the default view file.
--
-- Additive only: the main branch runs against the same database. Nothing existing is removed or made
-- stricter. The column, its check (1 to 200 characters or empty) and R11's trigger exist since the
-- Outlook file.
--
-- A new event may be written with a location. A location is changed later only through the narrow
-- function below, not by a column right: the function changes nothing but the location, only on the
-- signed-in user's own app events, so an Outlook event's location stays Outlook's (R11).

grant insert (location) on app.events to authenticated;

-- Sets the location of one of the signed-in user's own events. Empty or only spaces means none.
-- Another user's event and an unknown id are "Not found" (R3); an Outlook event is refused (R11).
-- updated_at moves on as with every change (R4: the events trigger).
create function app.set_event_location(event_id uuid, new_location text)
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
  update app.events
     set location = nullif(btrim(new_location), '')
   where id = event_id and user_id = uid;
end;
$$;

revoke all on function app.set_event_location(uuid, text) from public, anon;
grant execute on function app.set_event_location(uuid, text) to authenticated;
