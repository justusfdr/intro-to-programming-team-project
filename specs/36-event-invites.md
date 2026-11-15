# Spec 36: Inviting contacts to an event, inside the app
Asked for by the owner. Branch `37-event-invites`, from `36-event-preview`. Plan: `docs/ontology.md` (`event_invitation`, `set_event_invites`, `answer_event_invite`, `read_invited_events`, R59 to R64, R3's exception (5), R22 and R26 confirmed, R41 distinguished, section 7, A36, A37, the out-of-scope list; added 15 Nov 2026, spec 36, asked for by the owner; the team confirms with the merge). One additive migration: `supabase/migrations/20261210000000_event_invites.sql`.

## Why
The owner (translated): "One can invite the others to the event. They can accept an invitation and decline others. In the calendar it is dashed at first. When you hover, a green tick, an X or a dash is shown for yes, no and maybe." Guests (spec 24) are e-mail addresses that Outlook invites; this is the same idea between people who already use LockedIn and are contacts, with their answers in the app.

## What
- [x] Inviting (R59): the owner picks people from their real contacts in the editor ("People in LockedIn", above "Guests by e-mail (Outlook)"), for a single event of the app or the coach that has not ended; at most 20. It waits for Save like the other fields; Save then calls its own action (`POST /api/events/[id]/invites`). `create_event` and `edit_event` are unchanged. Where R59 forbids it, the section says why ("Events of a series cannot invite people", "This event has ended", …); without contacts, a link to People.
- [x] What the invited person sees (R60): the event in their calendar from the moment they are invited, read from the owner's row at each load: title, time or days, place, who invited them, the other invited people with names, photos and answers. Never notes, to-dos, goal, guests by e-mail, travel mode, `updated_at` or any id but the invitation's own.
- [x] Answering (R61): "Accept", "Maybe", "Decline" in the preview panel and in the toolbar's "2 invitations" list, saved at once with a quiet confirmation; the block changes at once: no answer yet dashed, maybe dashed and lighter with "Maybe", accepted solid with the inviter's avatar, declined left out of the grid (still in the list while the event has not ended). The sidebar's Calendar item has a badge with the number not answered.
- [x] Changes by the owner (R62): a move (start, end, days, timed ⇄ all-day) sets every answer back to no answer yet; title, place, notes and the rest keep them. Deleting the event, taking a person off, removing the contact or deleting an account removes the invitation. Undo of a delete does not invite again (the editor says so).
- [x] Read only for the invited (R63): an invited event is drawn like a shared one (right part of the day column), never dragged, resized or opened in the editor, never one of their events (overlap marks, coach, Outlook sync, analytics and focus ignore it). The owner's coach may not move or delete an event with invited people.
- [x] The owner's block: a stack of up to 3 avatars with "+N"; hovering or focusing it shows a small card with each person and their mark (green tick, red X, grey dash for maybe, empty ring for no answer yet); the block's accessible name lists them ("Emily Lea accepted"). The preview panel shows the same list in full.
- [x] Who sees what (R64): only the owner and the invited people; "Not found" alike for foreign, missing and malformed ids.
- [x] Demo: with the demo contacts on, Lea invites the user to her "Group project meeting" of this week. Generated in code (`src/lib/demo/invite.ts`), never a row; the answer is kept in this browser only, and the panel says so.
- [x] Database: `app.event_invites` (row-level security; the owner and the invited person read only `id, owner, invitee, answer, answered_at, created_at`, not the event's or the contact's id; no write right), a trigger that the contact row joins exactly owner and invitee and that the event is the owner's single event, the reset trigger on `app.events`, and security definer functions `set_event_invites`, `answer_event_invite`, `invited_events`, `open_event_invites`, `pending_invite_count`, `event_invitees`, `own_event_invitees`, `event_has_invites`, `invite_people`, `invite_person_names`; `app.may_see_profile` extended compatibly so the avatars load; `app.profile_card` unchanged.

## Decisions
- The table grants reading of the invitation's own columns only (not `event_id`, not `contact_id`): the invited person never learns the event's id. The owner reads their events' people through `event_invitees` and `own_event_invitees`; the coach asks `event_has_invites`.
- Co-invited people's names come from `invite_person_names` (display name and photo time; the part of the address before the "@" only for oneself and one's contacts, else "Invited person"), never from `profile_card`, which would hand out the address.
- "Not ended" is decided by the database's clock: a timed event at its end, an all-day event after its last day in the owner's time zone. Taking people off an ended event stays possible (as with guests).
- The demo invitation's answer is not counted in the sidebar's badge (the server cannot know it); the toolbar's button counts it.
- The calendar page reads everything in its one transaction (`loadCalendarPageWithInvites`); the existing loaders return exactly what they did.
- The editor's guests' heading is now "Guests by e-mail (Outlook)", to keep it apart from "People in LockedIn".

## Out of scope
Inviting people who are not contacts; proposing another time; comments; writing an accepted event to the invited person's Outlook; invitations to a series; invited events in the month view's owner marks (the owner's month cells show no avatar stack).

Still open: the reviewer applies the migration to the shared database; tried by hand in a browser with two accounts; the team confirms the ontology changes with the merge.

## Done when
`npm run check` passes; `npm audit --omit=dev` shows nothing; existing server, database and rule tests unchanged. New: `test/db/event-invites-schema.test.ts`, `src/lib/server/actions/event-invites.test.ts`, `src/lib/invites/types.test.ts`, `src/components/calendar/Invites.test.tsx`. Markup tests rewritten on purpose: `src/components/calendar/Guests.test.tsx`, `src/components/calendar/Todos.test.tsx` (the guests' heading and the new section before it).
