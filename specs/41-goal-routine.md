# Spec 41: A goal's routine, saved and checked
Branch `41-goal-plan`, from `main`. Decided in the team meeting of 16 Nov 2026; the team confirms with the merge. Step 1 of 3: spec 42 adds the guided questions and the routine in the goal editor, spec 43 gives the routine to the coach. Ontology: `goal` in sections 1 and 3, `create_goal`, `edit_goal`, R9, the new R44, section 7 and A25.

## Why
The team decided that a new goal is set up through 5 to 6 guided questions and that the coach plans the day around what the goal says about itself. Before the questions and the coach can use these facts, they must be saved, checked on the server and in the database, and read back. A goal may also have no end date ("learn the guitar"), which the app could not say until now.

## What
- [x] A goal may say about itself, all optional (R44): its category (`sport`, `uni`, `work`, `personal`, `other`, with an own word of up to 30 characters for `other`), how long one session usually is (15 to 240 minutes in steps of 15), when in the day it suits (`morning` before 12:00, `afternoon` 12:00 to 17:00, `evening` from 17:00, or any time), the weekdays it is never done on (0 to 6 of them) and where it is done (up to 200 characters). How often per week stays in the goal's rules (R7).
- [x] The week must still fit (R44): with k avoided days a `count` rule may ask for at most 2 × (7 − k) events a week and an `hours` rule for at most 12 × (7 − k) hours (R7's 60 still holds), checked with the rules and the days as they will be after the action.
- [x] A goal may have no end date. The `deadline` column stays `not null`, because the deployed app and teammates' older builds read every goal's deadline as a date: an open-ended goal has `open_ended = true` and a placeholder deadline, the user's today plus 364 days, written when the goal becomes open-ended and left alone by later edits. Everything new treats it as having no deadline: the page and the coach get `deadline: null`; the goal card says "No end date"; the strip of weeks runs from the week of creation to the current week, at most the latest 12 weeks.
- [x] The database (`20261213000000_goal_routine.sql`, additive only): seven new columns on `app.goals` with named checks and column grants for `authenticated`; a goal inserted the old way gets the defaults. No policy changes.
- [x] `create_goal` and `edit_goal` take the new fields after the existing checks, each with its message. Left out, a new goal gets none and an edit keeps the saved value; `null` (or an empty list of days) clears. A deadline of `null` means no end date. The answer carries one key `routine` only when something of it is set, so a goal without looks exactly as before.
- [x] One pure module, `src/lib/goals/routine.ts`, with the lists, the types, the saved text of the days, the two limits and one check of a whole routine with its rules; the server throws its message, and the screens of spec 42 will show the same sentence.
- [x] The goal editor has a checkbox "No end date" next to the deadline. It sends no routine field yet, so an edit keeps the routine.

## Decisions
- The avoided days are saved as text ("67" for weekends), not as an array: the real database driver does not get arrays or objects as parameters, and the check `^1?2?3?4?5?6?7?$` keeps each day once and in order.
- The own word for `other` follows the rule of a profile's bio (`app.list_text_valid`); sent with another category it is dropped, not refused. A word with a line break or an invisible character gets its own message ("Your own category must be on one line, without control characters"), so the user is not told the word is too long when it is not.
- The location is checked like an event's location, and also stored trimmed.

## Out of scope
The guided questions and their animations, and the routine in the goal editor (spec 42); sending the routine to the coach and planning with it (spec 43). `remove_rule` and `delete_goal` are unchanged: removing a rule can only make the week fit better.

## Done when
`goal-routine-schema.test.ts`, `routine.test.ts`, `progress-open-ended.test.ts`, `goal-routine.test.ts`, `goal-open-ended.test.ts` and the two new markup tests pass, and every existing test passes unchanged; `npm run check` and `npm audit --omit=dev` pass. The migration is run once by hand in the Supabase SQL editor. Reviewed by another member; merged only after the team confirms.
