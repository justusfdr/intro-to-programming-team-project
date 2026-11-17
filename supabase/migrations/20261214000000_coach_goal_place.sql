-- An accepted goal session takes the goal's place (spec 43, ontology R45; decided in the team meeting
-- of 16 November 2026). Run once in the Supabase SQL editor after 20261213000000_goal_routine.sql.
--
-- Additive only: one new function, nothing else. No table, column, check, trigger, policy or right
-- changes, and no existing function is replaced, so the code on main (and on every earlier branch)
-- keeps accepting and undoing its drafts exactly as before.
--
-- Why a function is needed: accept_draft creates a draft's events with app.chat_apply_draft_todos,
-- which remembers each created event's updated_at for undo (app.chat_undo_draft undoes only events
-- that are unchanged since). Writing the goal's place into a created event moves its updated_at on, so
-- undo would refuse ("This can no longer be undone"). This function writes the place through the
-- existing app.set_event_location and then remembers the event's new updated_at in the undo data, in
-- one step. Our server calls it right after app.chat_apply_draft_todos, in the same transaction: if
-- anything fails, nothing of the draft is applied.
--
-- What it does, for auth.uid()'s own draft only ("Not found" otherwise), and only once it is accepted:
--   * for every event the draft created that still exists, is unchanged since the draft was applied
--     (the updated_at in the undo data), has no location yet and belongs to a goal that has a place
--     (app.goals.location): sets that place as the event's location (app.set_event_location: own app
--     events only, never an Outlook event), and remembers the new updated_at for undo;
--   * every other created event, every moved and deleted event and everything else stays as it is.
-- The place comes only from the user's own goal in the database, never from the caller. Calling it
-- again changes nothing (the events have a location by then); an event the person changed since is
-- left alone, so the function never makes undo possible for an event that undo would refuse.
begin;

create function app.chat_place_created_events(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  draft record;
  item jsonb;
  ev record;
  place text;
  new_version timestamptz;
  created jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select d.id, d.status, d.undo into draft
    from app.draft_plans d where d.id = p_draft_id and d.user_id = uid for update;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  if draft.status <> 'accepted' or draft.undo is null or jsonb_typeof(draft.undo -> 'created') is distinct from 'array' then
    raise exception 'This draft is not applied' using errcode = '23514', constraint = 'draft_plans_not_applied';
  end if;

  for item in select x.value from jsonb_array_elements(draft.undo -> 'created') with ordinality as x(value, n) order by x.n loop
    select e.id, e.goal_id, e.location, e.updated_at into ev
      from app.events e
     where e.id = (item ->> 'id')::uuid and e.user_id = uid
       for update;
    if found and ev.location is null and ev.goal_id is not null
       and ev.updated_at = (item ->> 'updated_at')::timestamptz then
      select g.location into place from app.goals g where g.id = ev.goal_id and g.user_id = uid;
      if place is not null then
        perform app.set_event_location(ev.id, place);
        select e.updated_at into new_version from app.events e where e.id = ev.id;
        item := jsonb_set(item, '{updated_at}', to_jsonb(new_version));
      end if;
    end if;
    created := created || jsonb_build_array(item);
  end loop;

  update app.draft_plans set undo = jsonb_set(undo, '{created}', created) where id = draft.id;
end;
$$;

revoke all on function app.chat_place_created_events(uuid) from public, anon;
grant execute on function app.chat_place_created_events(uuid) to authenticated;

commit;
