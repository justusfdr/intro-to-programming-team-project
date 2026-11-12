# Spec 15: Dragging events, undo, the small new-event card
**This branch (`prototype-style`) is a variant for the team to compare with `main`.** It turns the app, step by step, into a copy of our first prototype's screens, with only the changes the owner decided. This is step 4b. Plan: `docs/ontology.md` (R38, added on this branch 12 Nov 2026; R1, R4, R11, R28). No database change, no new server rule.

## Why
In the prototype the calendar is used with the pointer: drag on free time to plan a block, drag a block to another time or day, pull its bottom edge to make it longer, and undo a slip at once. The rebuild could only click a slot (which opened the full editor) and change times in the editor; deleting asked "Yes, delete" every time.

## What
- [ ] Drag on free time (mouse or pen) creates: 15-minute snap, the dashed preview with its times, Escape cancels, the grid scrolls when the pointer nears its top or bottom. Releasing opens the prototype's small "New event" card next to the pointer: "What are you working on?", goal chips, Start and End (the end with its length), the chips 30m, 1h, 1.5h, 2h, "Add" and "Add details" (the full editor with title, goal and times filled in). A plain click opens the card for one hour from the half hour; "+" opens it at the button. On phones the card is a sheet and a tap opens it.
- [ ] Drag a block to move it (also to another day of the week) and its bottom edge to resize it: same snap, the start and end stay inside the day (end after start, at most 24 hours).
- [ ] The block moves when it is dropped; `edit_event` saves it in the background with the event's `updated_at` (R4). If the server refuses, the block goes back and the toast shows the ontology's message.
- [ ] Undo, as in the prototype: after a move, a resize or a delete a dark toast with "Undo" for 8 seconds ("Moved to Thu, Nov 19, 2 – 3pm", "Resized to …", "Event deleted"). Undo of a move or resize is `edit_event` back to the old times; undo of a delete is `create_event` with the same fields (a new id; done again if it was done). Deleting one event no longer asks "Yes, delete". An event of a series still asks "This event / This and following events" before a delete or a drop; after "This and following" a delete has no Undo.
- [ ] Cannot be dragged: Outlook events (R11), all-day events, the part of an event after midnight, and a block whose save is still running.
- [ ] Marks as in the prototype: done is the small green dot at the bottom right (the title stays as it is); an Outlook event has the calendar icon; the location shows on tall blocks. Kept from our rules: the conflict edge and icon, "Not sent to Outlook", the all-day row.
- [ ] Keyboard and screen readers: everything a drag does can still be done in the editor; blocks keep their spoken names; the toast is a status line and is read out.

## Out of scope
Dragging on phones (touch only taps, as in the prototype); dragging in the month view; dragging all-day events; undo of "this and following" deletes; keyboard shortcuts for undo.

## Done when
All tests pass on a temporary database; server, database and rule tests unchanged. The drag maths is tested in `src/lib/events/drag.test.ts` (snap, limits, columns, what may be dragged, a drop), what a drop and an undo send in `src/components/calendar/event-changes.test.ts`, the card, the toast and the editor's delete in `src/components/calendar/NewEventPopover.test.tsx`; the calendar markup test is rewritten in the same commit as the new marks. `npm run check` and `npm audit --omit=dev` pass. Previews of the card, the toast and the block marks read as the prototype's `desk-02-calendar.png` and `desk-03-event.png`. Dragging itself is tried by hand with a real pointer. Reviewed by another member; the team decides between this branch and `main`.
