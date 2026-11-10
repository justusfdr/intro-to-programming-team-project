# Spec 01: Accounts and events
Build step 1. Plan: `docs/ontology.md`. Branch: `01-accounts-and-events`.

## Why
A user signs up, plans events in a week view and finds them on any device. Nobody else can see or change them.

## What
- [ ] `sign_up` with a new email and an 8-character password creates the account (plan `free`, `time_zone` from the browser, or "Europe/Lisbon" if it gives none or an invalid one).
- [ ] `sign_up` rejects a registered email ("This email is already registered") and a 7-character password ("Password needs at least 8 characters"); nothing is created.
- [ ] `sign_in` with a wrong password: "Email or password is wrong". `sign_out` ends the session.
- [ ] Not signed in: sign-in page or "401", no data (R3).
- [ ] `create_event` "Statistics revision", 09:00 to 11:00, saves `planned`, `source` `app`, `may_overlap` false.
- [ ] `create_event` rejects an empty or 101-character title ("Title must be 1 to 100 characters"), 14:00 to 13:00 ("End must be after start") and 25 hours ("An event can last at most 24 hours"); nothing is saved (R1, A10).
- [ ] `edit_event` runs the same checks as `create_event`; `delete_event` removes the event.
- [ ] `mark_event_done` before the start: "You can mark an event done once it has started"; after it: `done`. `mark_event_planned` turns it back.
- [ ] Overlapping events are both saved; with `may_overlap` false on either, both get a conflict mark. 09:00–10:00 and 10:00–11:00 do not overlap (R10).
- [ ] The week view runs Monday 00:00 to Sunday 24:00 in the user's time zone; an event belongs to the day it starts (R2): Sunday 23:30 to Monday 00:30 is Sunday, that week.
- [ ] The week view opens on the current week; previous and next move a week.
- [ ] User A gets "Not found" for user B's event; A's edit or delete is rejected, B's event unchanged (R3, A8).
- [ ] Second device: same events; an edit or delete with an older `updated_at` gets "Changed on another device. Reload to see the latest version"; the first change stays (R4, A7).
- [ ] A user cannot change their own `plan`, even directly in the database (R6).
- [ ] No secret in the repository; `.env.local` git-ignored; `.env.example` lists names only.
- [ ] Row-level security is on for every table, and every check also holds when an address is called directly (R5).

## Out of scope
- Goals (no `goal_id`), location, travel time, Outlook, focus sessions, blocker, default block list, AI planner, payment, settings screen, `delete_account`.
- Creating the Supabase project and entering secrets: a team member's job, not the agent's.

## Done when
All tests pass (on a local or temporary database); output pasted in the pull request. Deployed at a public URL; two accounts checked there, each sees only its own events. `README.md` and `AGENTS.md` name the run and test commands. Reviewed by another member.
