# Spec 65: Events of a series can invite people in LockedIn
Branch `series-invites`, from `main`. Asked for by the owner on 21 Nov 2026. One additive database file, `supabase/migrations/20261223000000_series_invites.sql`. Five existing tests change on purpose (listed under "Done when").

## Why
The editor of an event of a series said "Events of a series cannot invite people." A series is only a set of single events with one series id (R28), so nothing stands against inviting people to them, and a weekly lecture or training is exactly what one does with others. Guests by e-mail stay as they are: Outlook would send one mail per date.

## What
- [x] An event of a series shows "People in LockedIn" with the contacts to tick, like a single event. Outlook, demo and ended events still say why they cannot invite.
- [x] Save on an event of a series asks "This event" or "This and following events" (R28), also when only the people changed. "This event" sets the people of this one event; "This and following events" gives this event and every later event of its series the same people. The event's other changes go with the same answer, first, then the people.
- [x] A new series can have people ticked before "Add event": they are invited to every event of the series.
- [x] Each date is its own invitation: the invited person sees each event in their calendar and answers each one (R60, R61). Moving an event asks them again (R62).
- [x] Database: `app.set_event_invites` and the table's check `app.check_event_invite` lose their "not of a series" condition, word for word otherwise. New `app.set_series_invites(event, contacts)`: this event and the later ones of its series, each through `app.set_event_invites`, so every check runs per event; one refusal saves nothing (R1). The action takes an optional `scope` (`this` or `this_and_following`).

## Ontology
R59 and the row of `set_event_invites` say "a single event (not of a series)". Proposed wording for R59: "… to an event of their own: `source` `app` or `assistant`, not a demo event, not an Outlook event, that has not ended … An event of a series asks for the scope (R28): this event, or this and the later events of its series, each with its own invitations and answers." And in the row of `set_event_invites`: the input gets "scope `this`/`this_and_following`", the check loses "(not of a series)", and the message "Events of a series cannot invite people" goes. The ontology is not changed here; the team decides.

## Out of scope
Guests by e-mail on a series (R41); one answer for a whole series; inviting people to the earlier events of a series.

## Done when
`test/db/event-invites-schema.test.ts`: an event of a series invites like a single event; "this and following" sets this and the later events and leaves earlier ones and other events alone, each date answered on its own; one refused date (a demo event) saves nothing; foreign events and contacts are "Not found"; the new function has the same rights as the others. `src/lib/server/actions/event-invites.test.ts`: the action with and without the scope, and an unknown scope is a bad request. These five tests held the old rule and were changed for this spec: in `test/db/event-invites-schema.test.ts` the series case left the refusals and the table now accepts a series event; in `src/lib/server/actions/event-invites.test.ts` and `src/lib/server/actions/invite-attacks.test.ts` the series case left the refusals (the attack test now checks that it is accepted); in `src/lib/invites/types.test.ts` an event of a series has no reason not to invite. `npm run check` passes. The database file is run once in the Supabase SQL editor.
