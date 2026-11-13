-- Guests on an event, invited through Outlook (spec 24, branch 24-guests). Run once in the Supabase SQL
-- editor after the earlier files.
--
-- Additive only: the code on main runs against the same database and must keep working unchanged.
-- Two new columns on app.events (empty for every existing row), their checks, one column right, one
-- trigger, and a new version of app.outlook_import that does everything the old one did for the input
-- main sends (no "attendees" or "organizer" in an element: the guests of an event stay as they are).
--
-- guests: the e-mail addresses of an event's guests. For the user's own events (source app or
--   assistant) the user sets them: up to 20 plain addresses, lower-case, each once. Null means the event
--   never had guests (it is sent to Outlook exactly as before, without attendees); an empty list means
--   it had some and they were all removed (Outlook gets an empty list). For an Outlook event they are
--   Outlook's attendees, written only by the import (up to 100), and R11's trigger
--   (app.keep_outlook_events) refuses any change by the user, as it refuses a new title.
-- organizer: only for an Outlook event, the organizer's address, written only by the import.
--
-- Guests' addresses are personal data: they stay in the owner's rows (row-level security, R3), are
-- never logged and never sent to Claude.

-- ---------- The shape of an address and of a list ----------

-- A plain e-mail address as the app takes it: lower-case, at most 254 characters, no name, no brackets.
-- The same pattern is in src/lib/events/guests.ts.
create function app.is_guest_address(p_address text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_address is not null
     and pg_catalog.char_length(p_address) <= 254
     and p_address ~ '^[a-z0-9!#$%&''*+/=?^_{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$';
$$;

-- A guest list: empty (null), or a flat list of addresses, each once, at most 20 on the user's own
-- events and at most 100 on an Outlook event.
create function app.guests_valid(p_guests text[], p_source text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_guests is null or (
    coalesce(pg_catalog.array_ndims(p_guests), 1) = 1
    and pg_catalog.cardinality(p_guests) <= case when p_source = 'outlook' then 100 else 20 end
    and not exists (select 1 from pg_catalog.unnest(p_guests) g where not app.is_guest_address(g))
    and (select count(*) = count(distinct g) from pg_catalog.unnest(p_guests) g)
  );
$$;

revoke all on function app.is_guest_address(text) from public, anon;
revoke all on function app.guests_valid(text[], text) from public, anon;
grant execute on function app.is_guest_address(text) to authenticated;
grant execute on function app.guests_valid(text[], text) to authenticated;

-- ---------- The columns ----------

alter table app.events
  add column guests text[],
  add column organizer text;

alter table app.events
  add constraint events_guests_shape check (app.guests_valid(guests, source)),
  -- Decision 2 of spec 24: no guests on an event of a series or a demo event (Outlook events are Outlook's).
  add constraint events_guests_single check (
    guests is null or pg_catalog.cardinality(guests) = 0 or source = 'outlook' or (series_id is null and not demo)
  ),
  add constraint events_organizer_shape check (organizer is null or (source = 'outlook' and app.is_guest_address(organizer)));

-- The user may write the guests of their own events (row-level security limits the rows; R11's trigger
-- refuses Outlook events). The organizer is never the user's to write.
grant insert (guests), update (guests) on app.events to authenticated;

-- Outlook sends the invitations, so guests are set or changed only while the user's Outlook is
-- connected ("Connect Outlook to invite guests"). Outlook events are left to R11's trigger. The
-- import and the other database functions run as the table owner and are not limited here.
create function app.guests_need_outlook()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' or new.source = 'outlook' then
    return new;
  end if;
  if (tg_op = 'INSERT' and coalesce(pg_catalog.cardinality(new.guests), 0) > 0)
     or (tg_op = 'UPDATE' and new.guests is distinct from old.guests) then
    if not exists (
      select 1 from app.calendar_connections c where c.user_id = new.user_id and c.status = 'connected'
    ) then
      raise exception 'Connect Outlook to invite guests' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.guests_need_outlook() from public, anon, authenticated;

create trigger guests_need_outlook
  before insert or update of guests on app.events
  for each row execute function app.guests_need_outlook();

-- ---------- The import takes attendees and organizer ----------

-- Outlook's attendees as a guest list: lower-cased, plain addresses only (rooms, groups and odd shapes
-- are dropped), each once, without the organizer, in Outlook's order, at most 100; null when none.
create function app.outlook_guest_list(p_attendees jsonb, p_organizer text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select nullif(array(
    select s.address from (
      select pg_catalog.lower(x.value) as address, min(x.n) as n
        from pg_catalog.jsonb_array_elements_text(
               case when pg_catalog.jsonb_typeof(p_attendees) = 'array' then p_attendees else '[]'::jsonb end
             ) with ordinality as x(value, n)
       where app.is_guest_address(pg_catalog.lower(x.value))
         and pg_catalog.lower(x.value) is distinct from p_organizer
       group by pg_catalog.lower(x.value)
       order by min(x.n)
       limit 100
    ) s
    order by s.n
  ), '{}'::text[]);
$$;

revoke all on function app.outlook_guest_list(jsonb, text) from public, anon, authenticated;

-- The import (R26), as in the Outlook file, plus each element's optional "attendees" (a list of
-- addresses) and "organizer" (an address or null). An element without both keys (the code on main)
-- leaves an event's guests and organizer as they are; everything else is unchanged.
create or replace function app.outlook_import(p_from timestamptz, p_to timestamptz, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e jsonb;
  v_people boolean;
  v_organizer text;
  v_guests text[];
begin
  if uid is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 5000 then raise exception 'bad import'; end if;

  -- App events created in Outlook whose answer never arrived: link them now, do not import them.
  update app.events ev set outlook_id = x.value ->> 'outlook_id', outlook_sent_version = ev.updated_at
    from jsonb_array_elements(p_events) x
   where ev.user_id = uid and ev.source <> 'outlook' and ev.outlook_id is null
     and ev.id::text = x.value ->> 'transaction_id'
     and not exists (select 1 from app.events o where o.user_id = uid and o.outlook_id = x.value ->> 'outlook_id');

  for e in select value from jsonb_array_elements(p_events) loop
    -- Our own events in Outlook are not imported again (also those with guests).
    continue when exists (
      select 1 from app.events o where o.user_id = uid and o.source <> 'outlook' and o.outlook_id = e ->> 'outlook_id'
    );
    v_people := (e ? 'attendees') or (e ? 'organizer');
    v_organizer := case when app.is_guest_address(lower(e ->> 'organizer')) then lower(e ->> 'organizer') end;
    v_guests := app.outlook_guest_list(e -> 'attendees', v_organizer);
    if (e ->> 'all_day')::boolean then
      insert into app.events (user_id, source, outlook_id, title, all_day, first_day, last_day, location, guests, organizer)
      values (uid, 'outlook', e ->> 'outlook_id', e ->> 'title', true, (e ->> 'first_day')::date, (e ->> 'last_day')::date, e ->> 'location',
              v_guests, v_organizer)
      on conflict (user_id, outlook_id) where outlook_id is not null do update
        set title = excluded.title, all_day = true, start_at = null, end_at = null,
            first_day = excluded.first_day, last_day = excluded.last_day, location = excluded.location,
            goal_id = null, status = 'planned',
            guests = case when v_people then excluded.guests else app.events.guests end,
            organizer = case when v_people then excluded.organizer else app.events.organizer end
        where app.events.source = 'outlook'
          and ((app.events.title, app.events.all_day, app.events.first_day, app.events.last_day, app.events.location)
                 is distinct from (excluded.title, true, excluded.first_day, excluded.last_day, excluded.location)
               or (v_people and (app.events.guests, app.events.organizer) is distinct from (excluded.guests, excluded.organizer)));
    else
      insert into app.events (user_id, source, outlook_id, title, all_day, start_at, end_at, location, guests, organizer)
      values (uid, 'outlook', e ->> 'outlook_id', e ->> 'title', false, (e ->> 'start_at')::timestamptz, (e ->> 'end_at')::timestamptz, e ->> 'location',
              v_guests, v_organizer)
      on conflict (user_id, outlook_id) where outlook_id is not null do update
        set title = excluded.title, all_day = false, first_day = null, last_day = null,
            start_at = excluded.start_at, end_at = excluded.end_at, location = excluded.location,
            guests = case when v_people then excluded.guests else app.events.guests end,
            organizer = case when v_people then excluded.organizer else app.events.organizer end
        where app.events.source = 'outlook'
          and ((app.events.title, app.events.all_day, app.events.start_at, app.events.end_at, app.events.location)
                 is distinct from (excluded.title, false, excluded.start_at, excluded.end_at, excluded.location)
               or (v_people and (app.events.guests, app.events.organizer) is distinct from (excluded.guests, excluded.organizer)));
    end if;
  end loop;

  -- Deleted in Outlook: imported events in the window that Outlook no longer lists.
  delete from app.events ev
   where ev.user_id = uid and ev.source = 'outlook'
     and (case when ev.all_day then ev.last_day >= (p_from at time zone 'UTC')::date and ev.first_day < (p_to at time zone 'UTC')::date
               else ev.start_at < p_to and ev.end_at > p_from end)
     and not exists (select 1 from jsonb_array_elements(p_events) x where x.value ->> 'outlook_id' = ev.outlook_id);
end;
$$;

-- create or replace keeps the old rights; repeated so the file says it.
revoke all on function app.outlook_import(timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function app.outlook_import(timestamptz, timestamptz, jsonb) to authenticated;
