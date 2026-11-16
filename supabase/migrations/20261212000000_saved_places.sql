-- Saved places and where a trip starts (changed on 16 November 2026). Run once in the Supabase SQL editor
-- after 20261211000000_draft_invites.sql.
--
-- Additive only: the main branch runs against the same database and keeps working unchanged.
--   1. app.places: the user's own places besides the home address ("Uni", "Gym"), at most 10.
--   2. app.events.travel_from: where the trip to an event starts. Empty means the standard: the place of
--      the event before it, else the home address. Otherwise 'home', 'last', 'place:<id of a place>' or
--      'address:<an address typed for this event>'. A place that is deleted later falls back to the standard.

create table app.places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  address text not null,
  created_at timestamptz not null default now(),

  constraint places_name_form check (name = btrim(name) and char_length(name) between 1 and 40),
  constraint places_address_form check (address = btrim(address) and char_length(address) between 1 and 300),
  constraint places_once_per_user unique (user_id, name)
);

-- At most 10 places per user. The lock makes two additions at the same moment take turns.
create function app.check_places_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('places:' || new.user_id::text));
  if (select count(*) from app.places where user_id = new.user_id) >= 10 then
    raise exception 'You can save at most 10 places' using errcode = '23514', constraint = 'places_at_most_10';
  end if;
  return new;
end;
$$;

revoke all on function app.check_places_limit() from public, anon, authenticated;

create trigger places_at_most_10
  before insert on app.places
  for each row execute function app.check_places_limit();

revoke all on app.places from public, anon, authenticated;
grant select, delete on app.places to authenticated;
grant insert (name, address), update (name, address) on app.places to authenticated;

alter table app.places enable row level security;

create policy "Users read their own places" on app.places for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own places" on app.places for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users change their own places" on app.places for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their own places" on app.places for delete to authenticated
  using (user_id = (select auth.uid()));

alter table app.events
  add column travel_from text,
  add constraint events_travel_from_form check (
    travel_from is null
    or travel_from in ('home', 'last')
    or travel_from ~ '^place:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (travel_from like 'address:%' and char_length(travel_from) between 9 and 308)
  );

grant insert (travel_from) on app.events to authenticated;

-- Sets where the trip to one of the signed-in user's own events starts; null means the standard.
-- Another user's event and an unknown id are "Not found" (R3); an Outlook event is refused (R11).
create function app.set_event_travel_from(event_id uuid, new_from text)
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
  update app.events set travel_from = new_from where id = event_id and user_id = uid;
end;
$$;

revoke all on function app.set_event_travel_from(uuid, text) from public, anon;
grant execute on function app.set_event_travel_from(uuid, text) to authenticated;
