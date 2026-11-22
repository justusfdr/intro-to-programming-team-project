# Spec 67: The coach keeps what fits
Branch `67-coach-partial-plan`, from `main`. Asked for by the owner on 22 Nov 2026. No change to the database. Changes ontology R23 (proposed here, the team confirms with the merge). Old tests change on purpose (listed under "Done when"; the owner agreed in the chat).

## Why
When one suggested slot of the coach broke a rule (it clashed with a lecture, left no time for the way to the gym, lay outside the visible hours), the whole answer was thrown away and the person only read "The assistant's answer failed our checks. Please try again". Nobody knew why, and there was no plan at all. That must not happen in a demo.

## What
- [x] `send_message` keeps every new event, move, delete and list of to-dos that passes the checks of R23 and leaves out each one that does not. The checks themselves do not change.
- [x] Order: first the moves and deletes, then the new events, then the to-dos for existing events, each in the coach's order; one is kept when it passes together with everything kept before it. The travel check of issue #227 works the same way on the new events that are kept.
- [x] Under the coach's text the answer says what was left out and why, in plain words, for example "• Gym, Tue, Nov 24, 18:00 – 19:00: it clashes with an event in your calendar." It uses the person's time zone and 12h/24h setting. At most 8 lines, then "…and 3 more."
- [x] When nothing is left, the answer becomes a text answer (no draft) that names what did not fit and asks to try other days or times.
- [x] Only an answer that cannot be read (not JSON, wrong shape, empty text, more than 30 things) still gives "failed our checks".
- [x] Coach text plus the note stay within 4,000 characters: the coach's text is shortened first ("…").

## Ontology
R23, last sentence, from "One failed check rejects the whole answer (R1)." to: "In the answer of `send_message`, a new event, a change or a list of to-dos that fails a check is left out and the rest is kept; the answer names each one left out with its reason, and becomes a text answer when nothing is left. Only an answer of the wrong shape, with no text or with more than 30 things is rejected as a whole (R1). `accept_draft` and `edit_draft` still check the whole draft: there one failed check rejects it."

## Out of scope
A second question to Claude when something does not fit (costs time and money); naming the calendar event a slot clashes with.

## Done when
New: `src/lib/chat/keep-what-fits.test.ts` (what is kept and left out, the order, the note, the length). Changed on purpose because they held the old rule "one failure rejects all" for `send_message`: the tests in `src/lib/server/actions/` that expected "failed our checks" for an answer with a slot that breaks a rule now expect the answer saved with that slot left out and named. `checkAnswer` (and its tests in `src/lib/chat/`) stays as it was. `npm run check` passes.
