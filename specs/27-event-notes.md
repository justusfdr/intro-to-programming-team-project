# Spec 27: Notes inside an event
Issue #5. Branch `issues-batch`, from `main`. Plan: `docs/ontology.md` (`event`'s `notes`, `create_event`, `edit_event`, R22, R26, the out-of-scope list; added 14 Nov 2026, issue #5; the team confirms with the merge; R4, R11, R28, R38, R39). One additive migration: `supabase/migrations/20261202000000_event_notes.sql`.

## Why
An event often needs a few words that belong to it and nowhere else: what to ask, what to bring, a link. Until now they had to go into the title or another app.

## What
- [x] An event of the user's own has notes: text of 1 to 2,000 characters (characters, not bytes: the same count in the editor, on the server and in the database), whitespace at the end trimmed, empty means none. Outlook events have none (R11): the editor leaves the section out, the server answers "Change this event in Outlook", the database refuses.
- [x] `create_event` and `edit_event` take `notes`; left out of an edit they stay. "Notes can be at most 2,000 characters"; a rejected save changes nothing (R1); an older `updated_at` is refused (R4). A new series gets them on every event; "This and following" on the later ones (R28).
- [x] The editor: a section "Notes" after Location, also in the new event's editor ("Add details"); a textarea that grows; a quiet count from 1,800 characters; above 2,000 the message and Save disabled. Notes wait for Save like the location (R39): a change shows Save, Discard puts them back.
- [x] Notes stay in the app: never sent to Outlook (R26) or to Claude (R22). The Outlook sync reads its own list of columns; an edit of the notes alone sends the event to Outlook again without them (the sync does not tell changes apart).
- [x] The calendar's Undo of a delete brings the event back with its notes (R38); the coach's undo of a draft that deleted an event too (`app.chat_apply_draft_todos` and `app.chat_undo_draft` replaced compatibly; old undo data restores none). A drag or a save shown at once keeps them on the block.
- [x] Database (additive): the column `notes`, its checks (length, no whitespace at the end, not on Outlook events), insert and update rights for the user; R11's trigger already refuses any change of an Outlook event.

## Out of scope
Formatting (bold, lists, links that open); notes on Outlook events or from Outlook's description; notes on a task or a goal; searching notes; notes shown on the block in the calendar.

Still open: the reviewer applies the migration and checks that `main` still works against it; tried by hand in a browser (typing, Save, reload, the count, an Outlook event); the team confirms the ontology changes with the merge.

## Done when
All tests pass on a temporary database with the fake Outlook and the fake assistant; existing server, database and rule tests unchanged. New: `test/db/event-notes-schema.test.ts`, `src/lib/server/actions/event-notes.test.ts`, `src/components/calendar/Notes.test.tsx`. `npm run check` passes.
