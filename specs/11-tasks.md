# Spec 11: Tasks under goals
Between build steps 2 and 3 of the plan, after spec 10. Plan: `docs/ontology.md` (tasks added 12 Nov 2026). Branch: `11-tasks`.

## Why
Users note the to-dos that move a goal forward right under that goal, and quick to-dos without a goal in an "Inbox", so the goals column shows what is left to do.

## What
- [ ] `add_task` "Buy running shoes" for the goal "Half marathon", due 20 Nov: saved `open`, listed under the goal, the goal's count says 1. `complete_task`: struck through, count 0 (A15).
- [ ] Rejected, nothing saved (R1): empty or 101-character title ("Title must be 1 to 100 characters"); due date before today in the user's time zone ("The due date cannot be in the past"). An unchanged past due date stays allowed when editing.
- [ ] At most 100 open tasks (R32): the 101st `add_task` and a `reopen_task` at 100 are rejected ("You can have at most 100 open tasks"), also when two requests arrive at the same moment (A16). Done tasks do not count.
- [ ] `complete_task` on a done task and `reopen_task` on an open one: "Not possible in this state".
- [ ] `edit_task` changes title, due date and goal; `delete_task` is always allowed.
- [ ] A task belongs to one of the user's goals or to none ("Inbox"). Another user's task or goal, a missing or a malformed id: "Not found"; their rows stay (R3). The database refuses a link to another user's goal, also on direct calls.
- [ ] `delete_goal` keeps its tasks; they move to "Inbox" (A17).
- [ ] The database sets the owner, `done_at` (when a task becomes done; empty when reopened), `created_at` and `updated_at`; a user can write only title, goal, due date and status.
- [ ] A done task is deleted by itself 7 days after it was done, when tasks are read (R33); this stays even if the user's next action is rejected.
- [ ] Under each goal, after its rules and weeks: open tasks by due date (earliest first, no date last), then done tasks struck through (R33). A due date before today shows as a red chip with "overdue" for screen readers.
- [ ] Each goal header shows the number of open tasks. Each section ends with "Add task" (Enter saves, Escape closes, optional due date). Clicking a task opens a small form for title, due date and goal, with Delete. An "Inbox" section with a grey tile is always at the bottom.
- [ ] The ring is a real button ("Mark '…' done" / "Reopen '…'"); results are announced like "Event saved."; rejections show the message next to the input. Works in the phone sheet and with keyboard and screen reader.

## Out of scope
Sub-tasks, repeating tasks, putting a task into the calendar, to-dos and notes inside an event, dragging to reorder, habits, milestones. Tasks never count for a rule and are not sent to the AI chat (R22, R32).

## Done when
All tests pass on a temporary database, existing tests unchanged; `npm run check` and `npm audit --omit=dev` pass. Previews of the goals column with tasks read as the same design as the prototype picture. Reviewed by another member; merged only after the user confirms.
