# Spec 02: Events
Build step 1, part 2 of 2. Plan: `docs/ontology.md`. Branch: `02-events`. Needs spec 01.

## Why
A signed-in user plans timed events in a week view and finds them on any device; nobody else sees them.

## What
- [ ] `create_event` "Statistics revision", 09:00 to 11:00, saves `planned`, `source` `app`, `may_overlap` false.
- [ ] `create_event` rejects an empty or 101-character title ("Title must be 1 to 100 characters"), 14:00 to 13:00 ("End must be after start") and 25 hours ("An event can last at most 24 hours"); nothing is saved (R1, A10).
- [ ] `edit_event` runs the same checks as `create_event`; `delete_event` removes the event.
- [ ] `mark_event_done` before the start: "You can mark an event done once it has started"; after: `done`; `mark_event_planned` undoes it.
- [ ] Overlapping events are both saved; `may_overlap` false on either gives both a conflict mark. 09:00–10:00 and 10:00–11:00 do not overlap (R10).
- [ ] The week view runs Monday 00:00 to Sunday 24:00 in the user's time zone; an event belongs to the day it starts (R2): Sunday 23:30 to Monday 00:30 is Sunday, that week.
- [ ] The week view opens on the current week; previous and next move a week.
- [ ] User A gets "Not found" for user B's event; A's edit or delete is rejected, B's event unchanged (R3, A8).
- [ ] Second device: same events; an edit or delete with an older `updated_at` gets "Changed on another device. Reload to see the latest version"; the first change stays (R4, A7).

## Out of scope
Goals (no `goal_id`), location, travel time, all-day and repeating events, Outlook, focus sessions, blocker, AI chat, payment.

## Done when
All tests pass (on a local or temporary database); output pasted in the pull request. Deployed at a public URL; two accounts checked there, each sees only its own events. Reviewed by another member.
