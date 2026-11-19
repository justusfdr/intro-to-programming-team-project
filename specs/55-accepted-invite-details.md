# Spec 55: An accepted invitation, almost like an own event
> 19 Nov 2026, asked for by the owner (translated): "I was invited to an event and pressed Accept. When I accept, I want to see everything, like on my own events: the address, the date. I should be able to add to-dos, and the others should see them too. I should be able to assign it to one of my goals. The route should be shown and I should be able to change it. And add a note. It should be quite similar to my own events." Branch `60-accepted-invite-details`, on top of spec 54. Ontology: `event_invitation` (sections 1, 3, 4), the new actions `read_accepted_invite_details`, `add_invite_todo` and the other to-do actions, `set_invite_notes`, `set_invite_personal`, `mark_invite_done`, `invite_travel_time`, R3's exception (5), R40, R60, R63, the new R65 to R67, section 7, A38 and the out-of-scope list (each marked "added 19 Nov 2026, spec 55").

## Why
Since spec 54 an invited person sees a small read-only card: title, time, place, who invited, the others. After accepting, the event is part of their day, but they cannot plan it: no to-dos, no notes, no route, and it never counts for their goals.

## Decisions (by the owner, 19 Nov 2026)
- **Only "accepted".** Maybe, declined and no answer keep the small card of spec 54 and see nothing new. A moved event sets the answer back to no answer yet (R62), so the full card needs a new Accept.
- **To-dos and notes are shared.** The owner and everyone who accepted see the same list and the same notes, also what the owner wrote before inviting, and can add, tick, rename, move and delete to-dos and change the notes.
- **Goal and route are personal.** Each invited person can give the event one of their own goals and choose their own start of the trip and way of getting there; stored on their invitation, never seen by the owner.
- **The goal counts.** An accepted event with one of the person's goals counts like an own event: done (their own "Mark done") for the rules and the days row, planned for the days row, in the goal widget and in analytics.
- **Title, time, date and place stay the owner's** (R63).

## What
- [x] **Database** (`supabase/migrations/20261220000000_accepted_invite_details.sql`, not applied to the live database). Four columns on the invitation that only the invited person reads (`goal_id` pointing at their own goals, `travel_mode`, `travel_from`, `status`), and security definer functions that find only the caller's own accepted invitation: reading the card and the to-dos, the five to-do changes, the notes (with the notes last read), the personal choices, the done mark, and the goal's events. Everything else is "Not found". The tables keep "own rows only"; the to-dos and notes stay on the owner's rows.
- [x] **Actions and routes** (`src/lib/server/actions/event-invites.ts`, `/api/invites/[id]/details`, `…/todos`, `…/todos/[todoId]/rename|done|move|delete`, `…/notes`, `…/personal`, `…/done`, `…/travel`). Each write answers with the whole card. A new shape `AcceptedInviteDetails` with its own key allow-list (`ACCEPTED_INVITE_KEYS`); `InvitedEvent` and its tests are unchanged.
- [x] **The full card** (`src/components/calendar/AcceptedInvite.tsx`): at the block, like the editor: the goal's tile and the title, date and time, "Invited by", Accept / Maybe / Decline (Accept pressed), TO-DOS (saved at once), GOAL (own goals), ROUTE (From and the way are the user's, To is the owner's place as text) with the travel line, NOTES with "Save notes" and "Discard" (refused with "Reload" when changed meanwhile), "Also invited", and one line on what is read only and what is shared. "Mark done" / "Reopen" in the footer once a timed event has started. Read again when the window comes back.
- [x] **The owner's editor shows the others' changes**: its to-do list is read again when the window comes back; newer notes from the calendar's re-read fill the notes field when the owner has not typed in it (`valuesAfterReread`).
- [x] **Goal counting** (`src/lib/server/goals/invited.ts`): goal progress and days row (`readGoalViews`, so the goals page, the calendar's goals and the widgets), the goal widget's ring, the Analytics page and the PDF report.

## Security
- Cross-user access only through the new database functions, each checking that the invitation is the caller's own and accepted; a to-do only when it belongs to that invitation's event.
- An invited person never writes the owner's title, times, days, place, goal, travel mode, start, status or guests: no function takes them, and the notes function writes only the notes (tested).
- The new columns are not granted to anyone; the owner cannot read the invited person's goal or start (an address may be personal data).
- The details reader is imported only by the invitation actions; each new function is named in exactly one module (`src/lib/server/invites/details-hygiene.test.ts`). The coach and Outlook never read any of it.

## Not in this spec
- The coach's "sessions left" of a goal (R45) does not count accepted invitations yet; the coach still never hears of invited events (R22).
- A focus session cannot be started for an invited event (R63 unchanged).
- No live push: changes show when the window comes back, at most every 10 seconds, or on Reload.
- The owner sees no mark of who added or changed a to-do.

## Done when
Lint, types and the whole test suite pass. New tests: `test/db/accepted-invite-details-schema.test.ts`, `src/lib/server/actions/accepted-invite-details.test.ts`, `src/lib/server/invites/details-hygiene.test.ts`, `src/components/calendar/AcceptedInvite.test.tsx`, `src/components/calendar/editor/reread.test.ts`. No existing test changed. Not yet tried by hand with two accounts.
