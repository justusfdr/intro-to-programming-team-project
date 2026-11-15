# Spec 37: The coach finds a time with contacts and invites them
Asked for and approved by the owner on 15 Nov 2026: busy times of named contacts may be sent, with the notice; the team confirms with the merge. Branch `38-coach-common-time`, from `37-event-invites`. Plan: `docs/ontology.md` (`draft_plan`'s invited people, `accept_draft`, `edit_draft`, `remove_draft_person`, R22 extended, R50, R58 adjusted, R65 to R68, section 7, A38, A39). One additive migration: `supabase/migrations/20261211000000_draft_invites.sql` (one new function, nothing else).

## Why
The owner (translated): "When one asks the coach: 'I need an appointment to go to sport with Lucas and Emily', at that time it lays the calendars over each other and finds a time, if there is one. It works when I may see Emily's calendar; then the coach can do it too, say 'okay, then sport fits well', and invite the others to the event. They can then accept or decline." He agreed that contacts' busy times go to the AI provider only with a clear notice.

## What
- [x] Who (R65): only people who share their calendar with the user (free/busy or details; real contacts, and demo contacts with a shared calendar while they are on), and only when named: the shown name, or its first word of at least 3 characters, as a whole word, in any case, in the new message or one of the last 10 messages. Matched on our server before anything of them is read. At most 5, the first 5 in the order named; with more, the answer says so.
- [x] What is sent (R66): per person a handle for this request ("p1"), the shown name, the time zone, and the busy times from now to the end of the 14th day plus 8 hours, merged, start and end only, at most 200. Never an id, address, photo, title, place or the level. Read through the share functions at the moment of the request. With nobody named the request is byte for byte what it was (same prompt, schema and data block).
- [x] Prompt and schema: only with people, the fixed prompt gets a fixed addition (the busy lists are other people's, are not to be listed, handles are the only way to name invited people, at most 3 alternatives, say plainly when there is no common time), and a new event gets a list of handles (`invite`).
- [x] Checks (R67): each handle must have been sent, and the time must not overlap any invited person's busy time. Such an event is left out and the answer says so in words; if nothing is left, the answer is a text without a draft. Every other R23 failure still rejects the whole answer. The draft stores contact row ids (`invite_contacts`) and, apart, demo ids (`demo_people`), never handles.
- [x] The card: "Invited" under the draft's days, per event with people: photo or initials, name, "Demo" and "Lea Sousa is a demo contact and gets no invitation"; while open, a button to take each person off (`POST /api/chat/drafts/[id]/people`, with the version, R4), never to add.
- [x] Accepting (R68): each invited person must still share their calendar, and the event's time (also after a drag) must fit their busy times read now, else "<name> no longer shares their calendar with you" / "The time no longer fits <name>" / "Someone you invited is no longer one of your contacts", nothing applied. Then the events are created and the real contacts invited in the same transaction; a failed invitation rolls everything back (the draft stays open). Undo removes the events and the invitations with them.
- [x] The notice (consent, R66): on the person's profile page, under the calendar choice, always while the calendar is shared: "<name> can ask their Coach to find a time with you. The Coach then gets your busy times, without titles or places, and they are sent to the AI provider." The coach's "What is sent?" gains: "If you name a contact who shares their calendar with you: their name and their busy times for the next 14 days (no titles, no places)."

## Decisions
- No change to the draft table: an extra key on a proposed event is accepted by every existing check and function (they read only the keys they know; `chat_edit_draft` changes only the times with `jsonb_set`, so a dragged block keeps its people). The migration adds only `app.chat_draft_remove_person`, because the user's role may not write a draft's content.
- The invitations are made by calling the existing `app.set_event_invites` for each created event inside the same `withUser` transaction as `app.chat_apply_draft_todos`, not by replacing the accept function: no existing function changes, the database's own checks of invitations (contact rows, the event, the limit) apply unchanged, and Postgres rolls the whole transaction back on any failure.
- A proposal that fails only because of its people is left out (not the whole answer), so the answer can say in words that it did not fit; every other check still rejects the whole answer as before.
- All-day events of a contact are not busy times (R29: all-day events never block).
- The busy times are written in the user's local time like everything else in the block, so the model compares like with like; the person's own time zone is sent beside them.
- Busy times are not re-checked when a block is dragged (`edit_draft` is unchanged); they are checked again, read fresh, at accept.
- The people of earlier drafts are not sent in the history (keeps the request unchanged when nobody is named).

## Out of scope
Adding people in the card; people who share no calendar ("Lucas" in the owner's example is not taken into account unless he shares); proposing a time on someone else's behalf; free/busy of people who are not contacts; sending the invitation to Outlook.

Still open: the reviewer applies the migration to the shared database and tries it by hand with two accounts; the real model's behaviour cannot be tested here.

## Done when
`npm run check` passes; `npm audit --omit=dev` shows nothing; existing server, database and rule tests unchanged. New: `src/lib/chat/people.test.ts`, `src/lib/chat/common-time.test.ts`, `src/lib/server/actions/coach-common-time.test.ts`, `test/db/draft-invites-schema.test.ts`, `src/components/coach/DraftPeople.test.tsx`.
