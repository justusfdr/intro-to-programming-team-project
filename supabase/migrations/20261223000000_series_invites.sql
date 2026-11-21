-- Inviting people in LockedIn to events of a series (spec 65, asked for by the owner; the team confirms
-- with the merge; ontology R59). Run once in the Supabase SQL editor after the earlier files.
--
-- Until now app.set_event_invites refused a new person on an event of a series. A series is only a set
-- of single events with one series_id (R28), so nothing stands against inviting people to each of them:
-- * app.check_event_invite (the trigger on app.event_invites) is replaced the same way, only without its
--   "not of a series" condition; the trigger itself stays as it is.
-- * app.set_event_invites is replaced with "create or replace": the same signature, return type,
--   security definer setting, empty search path and rights, its body word for word except that the
--   series check is gone. Everything else it checks stays (own event, own contacts, not Outlook, not a
--   demo event, not ended, at most 20).
-- * app.set_series_invites is new: the same list of people for this event and every later event of its
--   series (scope "this and following", as R28 does for edits). It calls app.set_event_invites for each
--   event, earliest first, so every check above runs per event. One refusal stops all of it: the call is
--   one statement, so nothing is saved (R1). For an event without a series it is app.set_event_invites.
--   Each event keeps its own invitations and answers; the invited person answers each date.
-- Guests by e-mail (R41) are not touched: a series still cannot have them (one Outlook mail per date).
--
-- The file runs as one transaction (begin ... commit) so that it is all or nothing in any SQL editor.

begin;

-- The table's own check, the same body word for word without "not of a series".
create or replace function app.check_event_invite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.contacts c
     where c.id = new.contact_id
       and c.user_a = least(new.owner, new.invitee)
       and c.user_b = greatest(new.owner, new.invitee)
  ) then
    raise exception 'An invitation belongs to the two people of its contact' using errcode = '23514';
  end if;
  if not exists (
    select 1 from app.events e
     where e.id = new.event_id
       and e.user_id = new.owner
       and e.source in ('app', 'assistant')
       and not e.demo
  ) then
    raise exception 'Only the owner''s own single event can invite people' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and (select count(*) from app.event_invites i where i.event_id = new.event_id) >= 20 then
    raise exception 'An event can invite at most 20 people' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app.check_event_invite() from public, anon, authenticated;

create or replace function app.set_event_invites(p_event uuid, p_contacts uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_event app.events%rowtype;
  v_wanted uuid[];
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_event from app.events e where e.id = p_event and e.user_id = uid for update;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if p_contacts is null or coalesce(pg_catalog.array_ndims(p_contacts), 1) <> 1 or pg_catalog.array_position(p_contacts, null) is not null then
    raise exception 'Invalid request.' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.array_agg(distinct w), '{}'::uuid[]) into v_wanted from pg_catalog.unnest(p_contacts) w;
  if exists (
    select 1 from pg_catalog.unnest(v_wanted) w
     where not exists (select 1 from app.contacts c where c.id = w and uid in (c.user_a, c.user_b))
  ) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(v_wanted) w
     where not exists (select 1 from app.event_invites i where i.event_id = p_event and i.contact_id = w)
  ) then
    if v_event.source = 'outlook' then
      raise exception 'Outlook events cannot invite people' using errcode = '22023';
    end if;
    if v_event.demo then
      raise exception 'Demo events cannot invite people' using errcode = '22023';
    end if;
    if app.event_has_ended(p_event) then
      raise exception 'People can only be invited to events that have not ended' using errcode = '22023';
    end if;
  end if;
  if pg_catalog.cardinality(v_wanted) > 20 then
    raise exception 'An event can invite at most 20 people' using errcode = '22023';
  end if;
  delete from app.event_invites i where i.event_id = p_event and not (i.contact_id = any (v_wanted));
  insert into app.event_invites (event_id, contact_id, owner, invitee)
  select p_event, c.id, uid, case when c.user_a = uid then c.user_b else c.user_a end
    from app.contacts c
   where c.id = any (v_wanted)
     and not exists (select 1 from app.event_invites i where i.event_id = p_event and i.contact_id = c.id)
   order by c.id;
end;
$$;

revoke all on function app.set_event_invites(uuid, uuid[]) from public, anon;
grant execute on function app.set_event_invites(uuid, uuid[]) to authenticated;

-- This event and the later events of its series get the same people (R28's "this and following").
create function app.set_series_invites(p_event uuid, p_contacts uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_event app.events%rowtype;
  v_later uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_event from app.events e where e.id = p_event and e.user_id = uid;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if v_event.series_id is null or v_event.start_at is null then
    perform app.set_event_invites(p_event, p_contacts);
    return;
  end if;
  for v_later in
    select e.id from app.events e
     where e.user_id = uid and e.series_id = v_event.series_id and e.start_at >= v_event.start_at
     order by e.start_at, e.id
  loop
    perform app.set_event_invites(v_later, p_contacts);
  end loop;
end;
$$;

revoke all on function app.set_series_invites(uuid, uuid[]) from public, anon;
grant execute on function app.set_series_invites(uuid, uuid[]) to authenticated;

commit;
