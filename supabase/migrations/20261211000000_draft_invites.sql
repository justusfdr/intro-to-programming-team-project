-- The coach finds a time with contacts (spec 37; ontology R65 to R68). Run once in the Supabase SQL
-- editor after 20261210000000_event_invites.sql.
--
-- Additive only: one new function, nothing else. No table, column, check, trigger or right changes,
-- and no existing function is replaced, so the code on main (and on every earlier branch) keeps
-- creating, editing, accepting and undoing its drafts exactly as before.
--
-- Why nothing else is needed:
--   * A proposed event of a draft (app.draft_plans.proposed_events) may carry two more keys, written by
--     our server when it saves the assistant's checked answer: "invite_contacts" (a list of contact row
--     ids, resolved on the server, never taken from the model) and "demo_people" (the fixed ids of demo
--     contacts, for the card only). No check of the table looks at the keys of a proposed event, and
--     every function reads only the keys it knows: app.chat_apply_draft_todos (and the older
--     app.chat_apply_draft and app.chat_accept_draft) create the event from title, start, end, goal and
--     to-dos and ignore the rest; app.chat_edit_draft changes only "start_at" and "end_at" with
--     jsonb_set, so a dragged block keeps its people; undo deletes the created events, and the
--     invitations go with them (app.event_invites.event_id references app.events on delete cascade).
--   * The invitations themselves are made by app.set_event_invites (spec 36), which our server calls for
--     each created event in the same transaction as app.chat_apply_draft_todos (accept_draft): if it
--     refuses, the whole transaction rolls back. It checks the contact rows, the event and the limit
--     itself, exactly as when the person invites someone in the editor.
--
-- The one new function: before applying a draft, the person can take someone off a proposed event in
-- the card (never add someone). The user's role still has no right to write a draft's content, so this
-- goes through a security definer function like app.chat_edit_draft:
--   * only auth.uid()'s own draft ("Not found" otherwise), only while it is open, only with the version
--     the screen last saw (R4, "Changed on another device");
--   * only a person the proposed event at p_index really lists ("Not found" otherwise);
--   * it removes that one key from "invite_contacts" (a uuid) or "demo_people" (a demo id), drops the
--     list when it becomes empty, keeps everything else of the draft, and moves the version on by one
--     (the trigger app.check_draft_edit checks both again). Returns the new version.
begin;

create function app.chat_draft_remove_person(p_draft_id uuid, p_version integer, p_index integer, p_person text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  draft record;
  proposal jsonb;
  list_key text;
  kept jsonb;
  new_version integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select d.id, d.status, d.version, d.proposed_events into draft
    from app.draft_plans d where d.id = p_draft_id and d.user_id = uid for update;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  if draft.status <> 'open' then
    raise exception 'This draft is no longer open' using errcode = '23514', constraint = 'draft_plans_status_forward';
  end if;
  if p_version is null or draft.version <> p_version then
    raise exception 'Changed on another device' using errcode = '23514', constraint = 'draft_plans_stale';
  end if;
  if p_index is null or p_person is null or p_index < 0 or p_index >= jsonb_array_length(draft.proposed_events) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;

  proposal := draft.proposed_events -> p_index;
  list_key := case when p_person in ('demo-lea', 'demo-jonas', 'demo-maya') then 'demo_people' else 'invite_contacts' end;
  if jsonb_typeof(proposal) is distinct from 'object'
     or jsonb_typeof(proposal -> list_key) is distinct from 'array'
     or not ((proposal -> list_key) @> jsonb_build_array(p_person)) then
    raise exception 'Not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(x.value order by x.n), '[]'::jsonb) into kept
    from jsonb_array_elements(proposal -> list_key) with ordinality as x(value, n)
   where x.value <> to_jsonb(p_person);
  if jsonb_array_length(kept) = 0 then
    proposal := proposal - list_key;
  else
    proposal := jsonb_set(proposal, array[list_key], kept);
  end if;

  update app.draft_plans
     set proposed_events = jsonb_set(proposed_events, array[p_index::text], proposal),
         version = version + 1
   where id = draft.id
  returning version into new_version;
  return new_version;
end;
$$;

revoke all on function app.chat_draft_remove_person(uuid, integer, integer, text) from public, anon;
grant execute on function app.chat_draft_remove_person(uuid, integer, integer, text) to authenticated;

commit;
