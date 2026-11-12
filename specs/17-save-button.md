# Spec 17: A Save button in the event editor
Branch `17-save-button`, from `prototype-style`. Plan: `docs/ontology.md` (R39, changed on this branch 12 Nov 2026 at the owner's request; R1, R4, R11, R28). No change to the server or the database.

## Why
The editor saved every change the moment it was made (spec 16). The owner wants to decide himself when an event is saved: change or remove something, look at it, then save. The button should not be in the way while nothing was changed.

## What
- [ ] A change in the editor of an existing event (title, day, times, all day, goal, location, overlap) shows in the editor only. Nothing is sent and the block in the calendar does not move.
- [ ] As soon as a field differs from the saved event, the footer shows "Save" and "Discard" in place of "Start focus" and "Mark done". Taking the change back by hand hides them again. Spaces around the title or the location do not count.
- [ ] "Save" sends `edit_event` with all the fields and the `updated_at` the screen last saw (R4). The calendar shows the change at once; the footer goes back to "Start focus", "Mark done" and the bin. With an empty title "Save" is disabled.
- [ ] A refusal shows the ontology's message (and "Reload" when another device saved first) and keeps the fields as typed, with "Save" still there (R1: nothing was saved).
- [ ] "Discard" puts the saved values back. Closing the editor (the cross, Esc, a click outside) drops changes that were not saved.
- [ ] An event of a series: "Save" first asks "This event / This and following events" (R28); "Cancel" keeps the fields and the Save button.
- [ ] An Outlook event: only a new goal counts as a change (R11).
- [ ] "Mark done", "Reopen" and the bin are still sent at once. A new event is unchanged ("Add event").

## Out of scope
A question before closing with unsaved changes; saving with a key (for example ⌘S); undo of a saved change in the toast.

## Done when
All tests pass; server, database and rule tests unchanged. New in `src/components/calendar/editor/values.test.ts`: whether something changed (unchanged, each field, taken back, spaces, Outlook). `EventEditor.test.tsx`: an unchanged event shows no Save button. `npm run check` passes. Tried by hand in a real browser: the button appears and disappears, Save, Discard, a refusal, closing without saving. The owner tests it, then it is merged into `prototype-style`.
