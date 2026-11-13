# Spec 04: Focus sessions
Build step 3, part 1 of 2. Plan: `docs/ontology.md`. Branch: `04-focus-sessions`.

## Why
A user works on one thing with a timer, alone or for a planned event, and rates how it went. Sessions later switch the blocker on (spec 05) and feed the focus score (step 4).

## What
- [ ] `start_session` with 60 minutes and no event: `running`, `started_at` now, `paused_seconds` 0.
- [ ] `start_session` with 0 minutes (or 1440, or not a whole number): "Choose a length from 1 minute to 23 h 59 min"; nothing saved (A10, R12).
- [ ] A second `start_session` while one is `running` or `paused`: "A session is already running"; the database allows only one, also from two devices (R4).
- [ ] `start_session` from the user's own event links it; another user's event is "Not found".
- [ ] `pause_session` sets `paused`; `resume_session` adds the paused time to `paused_seconds`. Pausing a paused or resuming a running session: "Not possible in this state".
- [ ] `end_session` on a running or paused session: `finished` with `ended_at`. Ending, pausing, resuming or cancelling a finished session: "This session has already ended".
- [ ] A2: 60 minutes from 09:00, paused 09:20 to 09:30, ended 09:55: focused 45 minutes (R13).
- [ ] A running session finishes by itself at `started_at` + planned minutes + `paused_seconds`, worked out by the server, also with the browser closed. A paused session stays paused (R13).
- [ ] `cancel_session` deletes the session. Ending with under one focused minute deletes it too (R14).
- [ ] `rate_session` on a finished session saves 0 to 5 and can change it; 6 or 4.5: "Rating must be a whole number from 0 to 5". No rating stays empty; 0 is a rating (R14).
- [ ] User B's session is "Not found" for user A; nothing of B's changes (R3).
- [ ] Focus page: the suggested lengths 15, 30, 60, 90, 120 minutes and "Custom", a wheel of hours and minutes for any length from 1 minute to 23 h 59 min (R12); a ring with the time left; pause, resume, end, cancel; the rating after the end. Every state is announced to screen readers.
- [ ] "Focus" in the sidebar; the event editor offers "Start focus" for an event.

## Out of scope
Blocking, the extension and the block list (spec 05); focus score and analytics (step 4); sounds and breaks from the prototype.

## Done when
All tests pass on a temporary database; output in the pull request. Deployed; a session started, paused, ended and rated there. Reviewed by another member.
