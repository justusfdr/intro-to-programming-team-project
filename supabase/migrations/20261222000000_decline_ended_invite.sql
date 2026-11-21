-- Spec 64 (asked for by the owner, 21 Nov 2026; the team confirms with the merge): an invited person
-- can still DECLINE an event that has ended, so a past invitation can be taken out of their calendar
-- afterwards (a declined invitation is not drawn, R61). Accept and maybe stay refused once the event has
-- ended ("This event has ended"). Everything else is as in 20261210000000_event_invites.sql: only the
-- invited person, only their own invitation; "Not found" for anything else.
create or replace function app.answer_event_invite(p_invite uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_event uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select i.event_id into v_event from app.event_invites i where i.id = p_invite and i.invitee = uid for update;
  if v_event is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if p_answer is null or p_answer not in ('accepted', 'tentative', 'declined') then
    raise exception 'Choose accept, maybe or decline' using errcode = '22023';
  end if;
  if p_answer <> 'declined' and app.event_has_ended(v_event) then
    raise exception 'This event has ended' using errcode = '22023';
  end if;
  update app.event_invites set answer = p_answer, answered_at = pg_catalog.clock_timestamp() where id = p_invite;
end;
$$;

revoke all on function app.answer_event_invite(uuid, text) from public, anon;
grant execute on function app.answer_event_invite(uuid, text) to authenticated;
