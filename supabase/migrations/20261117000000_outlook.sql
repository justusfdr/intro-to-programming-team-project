-- Build step 5, part 2: Outlook in both directions (spec 08). Run once in the Supabase SQL editor after
-- the all-day file.
--
-- Users still cannot write `source` or `outlook_id`. The only paths that set them are the functions
-- below, which work on the signed-in user's own rows (auth.uid()) and are called by our server inside
-- withUser. The stored Microsoft access is ciphertext; users cannot read or write that column at all.

-- ---------- Events: Outlook columns ----------

alter table app.events
  -- Where the event takes place; filled from Outlook now, by the user from step 7 (travel time).
  add column location text,
  -- The event's id in Outlook: for an imported event its origin, for an app event its copy.
  add column outlook_id text,
  -- The updated_at that was last sent to Outlook. Equal to updated_at: Outlook has the latest version.
  add column outlook_sent_version timestamptz;

alter table app.events
  add constraint events_location_length check (location is null or char_length(location) between 1 and 200),
  add constraint events_outlook_id_length check (outlook_id is null or char_length(outlook_id) between 1 and 512),
  add constraint events_outlook_has_id check (source <> 'outlook' or outlook_id is not null);

create unique index events_user_outlook_id on app.events (user_id, outlook_id) where outlook_id is not null;

-- updated_at moves on every change except one that only records what was sent to Outlook (R4: the
-- device's copy stays valid while the sync runs in the background).
create or replace function app.set_events_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'outlook_id' - 'outlook_sent_version' - 'updated_at')
       = (to_jsonb(old) - 'outlook_id' - 'outlook_sent_version' - 'updated_at') then
      new.updated_at := old.updated_at;
      return new;
    end if;
    new.updated_at := greatest(
      date_trunc('milliseconds', pg_catalog.clock_timestamp()),
      old.updated_at + interval '1 millisecond'
    );
  else
    new.updated_at := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  end if;
  return new;
end;
$$;

-- R11 in the database: a user may set only the goal and the status of an Outlook event, and may not
-- delete it. The import function runs as the table owner, not as "authenticated", and is not limited.
create function app.keep_outlook_events()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source = 'outlook' and current_user = 'authenticated' then
    if tg_op = 'DELETE' then
      raise exception 'Change this event in Outlook' using errcode = '42501';
    end if;
    if (to_jsonb(new) - 'goal_id' - 'status' - 'updated_at')
       is distinct from (to_jsonb(old) - 'goal_id' - 'status' - 'updated_at') then
      raise exception 'Change this event in Outlook' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app.keep_outlook_events() from public, anon, authenticated;

create trigger keep_outlook_events
  before update or delete on app.events
  for each row execute function app.keep_outlook_events();

-- ---------- The connection ----------

create table app.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'connected',
  -- The Microsoft refresh token, encrypted by our server (AES-256-GCM). Never readable by users.
  token_encrypted text not null,
  -- The last sync that finished, shown as "Last synced 08:40".
  last_synced_at timestamptz,
  -- The last sync that started; at most one every 5 minutes.
  sync_started_at timestamptz,
  created_at timestamptz not null default now(),

  constraint calendar_connections_status check (status in ('connected', 'needs_reconnect')),
  constraint calendar_connections_token_shape check (token_encrypted like 'v1.%' and char_length(token_encrypted) <= 8000)
);

revoke all on app.calendar_connections from public, anon, authenticated;
grant select (id, user_id, status, last_synced_at, sync_started_at, created_at) on app.calendar_connections to authenticated;

alter table app.calendar_connections enable row level security;
create policy "Users read their own connection" on app.calendar_connections
  for select to authenticated
  using (user_id = (select auth.uid()));

-- App events deleted after they were sent: Outlook still has them until the next send deletes them.
create table app.outlook_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  outlook_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, outlook_id)
);

revoke all on app.outlook_deletions from public, anon, authenticated;
grant select on app.outlook_deletions to authenticated;
alter table app.outlook_deletions enable row level security;
create policy "Users read their own deletions" on app.outlook_deletions
  for select to authenticated
  using (user_id = (select auth.uid()));

create function app.remember_outlook_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Not when the whole account is being deleted (the user row is already gone then).
  if old.source <> 'outlook' and old.outlook_id is not null
     and exists (select 1 from auth.users u where u.id = old.user_id) then
    insert into app.outlook_deletions (user_id, outlook_id) values (old.user_id, old.outlook_id)
    on conflict (user_id, outlook_id) do nothing;
  end if;
  return old;
end;
$$;

revoke all on function app.remember_outlook_deletion() from public, anon, authenticated;

create trigger remember_outlook_deletion
  after delete on app.events
  for each row execute function app.remember_outlook_deletion();

-- ---------- Functions for the signed-in user's own rows ----------
-- Each one is security definer (it runs as the owner), so each one limits itself to auth.uid().

-- connect_outlook: saves the encrypted token. A new or renewed connection may sync at once.
create function app.outlook_connect(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into app.calendar_connections (user_id, token_encrypted) values (uid, p_token)
  on conflict (user_id) do update set token_encrypted = excluded.token_encrypted, status = 'connected', sync_started_at = null;
end;
$$;

-- Microsoft sent a new refresh token during a sync: replace the stored one.
create function app.outlook_save_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update app.calendar_connections set token_encrypted = p_token where user_id = auth.uid() and status = 'connected';
$$;

-- The stored token, still encrypted. Only while connected.
create function app.outlook_token()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select token_encrypted from app.calendar_connections where user_id = auth.uid() and status = 'connected';
$$;

-- Microsoft refused the stored access.
create function app.outlook_needs_reconnect()
returns void
language sql
security definer
set search_path = ''
as $$
  update app.calendar_connections set status = 'needs_reconnect' where user_id = auth.uid();
$$;

-- sync_outlook may start: connected, and no sync started in the last 5 minutes (database clock).
create function app.outlook_begin_sync()
returns boolean
language sql
security definer
set search_path = ''
as $$
  with started as (
    update app.calendar_connections set sync_started_at = pg_catalog.now()
     where user_id = auth.uid() and status = 'connected'
       and (sync_started_at is null or sync_started_at <= pg_catalog.now() - interval '5 minutes')
    returning 1
  )
  select exists (select 1 from started);
$$;

create function app.outlook_finish_sync()
returns void
language sql
security definer
set search_path = ''
as $$
  update app.calendar_connections set last_synced_at = pg_catalog.now() where user_id = auth.uid();
$$;

-- The import (R26): Outlook's events in the window [p_from, p_to) replace the user's imported events
-- there. Each element: outlook_id, title, all_day, start_at/end_at or first_day/last_day, location,
-- and transaction_id (our event id, for an app event whose create answer was lost).
create function app.outlook_import(p_from timestamptz, p_to timestamptz, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e jsonb;
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
    -- Our own events in Outlook are not imported again.
    continue when exists (
      select 1 from app.events o where o.user_id = uid and o.source <> 'outlook' and o.outlook_id = e ->> 'outlook_id'
    );
    if (e ->> 'all_day')::boolean then
      insert into app.events (user_id, source, outlook_id, title, all_day, first_day, last_day, location)
      values (uid, 'outlook', e ->> 'outlook_id', e ->> 'title', true, (e ->> 'first_day')::date, (e ->> 'last_day')::date, e ->> 'location')
      on conflict (user_id, outlook_id) where outlook_id is not null do update
        set title = excluded.title, all_day = true, start_at = null, end_at = null,
            first_day = excluded.first_day, last_day = excluded.last_day, location = excluded.location,
            goal_id = null, status = 'planned'
        where app.events.source = 'outlook'
          and (app.events.title, app.events.all_day, app.events.first_day, app.events.last_day, app.events.location)
              is distinct from (excluded.title, true, excluded.first_day, excluded.last_day, excluded.location);
    else
      insert into app.events (user_id, source, outlook_id, title, all_day, start_at, end_at, location)
      values (uid, 'outlook', e ->> 'outlook_id', e ->> 'title', false, (e ->> 'start_at')::timestamptz, (e ->> 'end_at')::timestamptz, e ->> 'location')
      on conflict (user_id, outlook_id) where outlook_id is not null do update
        set title = excluded.title, all_day = false, first_day = null, last_day = null,
            start_at = excluded.start_at, end_at = excluded.end_at, location = excluded.location
        where app.events.source = 'outlook'
          and (app.events.title, app.events.all_day, app.events.start_at, app.events.end_at, app.events.location)
              is distinct from (excluded.title, false, excluded.start_at, excluded.end_at, excluded.location);
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

-- After a send: each element is event_id, version (the updated_at that was sent) and outlook_id
-- (null when Outlook no longer has the event, so it is sent again). Only the user's app events.
create function app.outlook_mark_sent(p_results jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update app.events ev
     set outlook_id = x.value ->> 'outlook_id',
         outlook_sent_version = case when x.value ->> 'outlook_id' is null then null else (x.value ->> 'version')::timestamptz end
    from jsonb_array_elements(p_results) x
   where ev.user_id = auth.uid() and ev.source <> 'outlook' and ev.id::text = x.value ->> 'event_id';
$$;

-- Deletions Outlook has carried out (or that no longer exist there).
create function app.outlook_forget_deletions(p_outlook_ids text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from app.outlook_deletions where user_id = auth.uid() and outlook_id = any (p_outlook_ids);
$$;

-- disconnect_outlook (R26): the connection and the imported events go; what the app wrote stays in
-- Outlook. App events keep the id of their copy there, so connecting the same account again updates
-- those copies instead of adding them twice (another account answers "not found": they are sent anew).
create function app.outlook_disconnect()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  delete from app.events where user_id = uid and source = 'outlook';
  delete from app.calendar_connections where user_id = uid;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'app.outlook_connect(text)', 'app.outlook_save_token(text)', 'app.outlook_token()', 'app.outlook_needs_reconnect()',
    'app.outlook_begin_sync()', 'app.outlook_finish_sync()', 'app.outlook_import(timestamptz, timestamptz, jsonb)',
    'app.outlook_mark_sent(jsonb)', 'app.outlook_forget_deletions(text[])', 'app.outlook_disconnect()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
