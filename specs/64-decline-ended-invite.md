# Spec 64: Declining an invitation after the event has ended
Branch `invited-past-remove`, from `main`. Asked for by the owner on 21 Nov 2026. **Changes the database:** one migration (`20261222000000_decline_ended_invite.sql`) replaces `app.answer_event_invite`. One existing test changes on purpose (listed under "Done when").

## Why
An event someone invited you to stayed in your calendar for good once it was over: Accept, Maybe and Decline all answered "This event has ended", so a past invitation could not be taken out of the calendar any more.

## What
- [x] After the event has ended the invited person can still **decline**. A declined invitation is not drawn (R61), so the event leaves their calendar. The owner sees "declined".
- [x] Accept and Maybe stay refused once the event has ended ("This event has ended"), also for an invitation that was declined after the end.
- [x] In the card (small and accepted), once the event has ended, Accept and Maybe are greyed out and a line says "This event has ended. Decline it to remove it from your calendar."
- [x] Everything else as before: only the invited person answers their own invitation, "Not found" for anybody else.

## Ontology
R61 says the answer can be changed "while the event has not ended", and `answer_event_invite` lists "the event has not ended" as its condition. Proposed wording: "… while the event has not ended; after that it can still be declined, which takes it out of the calendar." The ontology is not changed here; the team decides.

## Out of scope
Removing the invitation itself (the owner keeps seeing the person, now as declined); hiding a past invitation without telling the owner.

## Done when
`test/db/event-invites-schema.test.ts`: declining an ended event is saved; accept and maybe are refused and change nothing; strangers get "Not found". `src/lib/server/actions/event-invites.test.ts`: the route saves a decline of an ended event and refuses maybe. `src/lib/server/actions/invite-attacks.test.ts`: the test "answering after the event has ended is refused" used "declined" for its refused answer; it now uses "accepted" and "tentative" (declining is allowed now). `src/components/calendar/Invites.test.tsx` and `src/lib/invites/types.test.ts`: the buttons and the ended check. `npm run check` passes.
