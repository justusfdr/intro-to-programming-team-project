# Spec 63: The front door leads to the landing page
Branch `visitor-home-and-docs-cleanup`, from `main`. Decided on 21 Nov 2026. No change to the database. Four existing tests change on purpose (listed under "Done when").

## Why
The README gives the app's address without a path. A visitor who opened it saw only a sign-in form and nothing that says what the app is, and the landing page at `/home` (specs 45 and 62) could not be reached from there. Spec 45 left this for the team to decide.

## What
- [x] A signed-out visitor of the bare address `/`, with or without a query, is sent to `/home`.
- [x] Every other page of the app still sends a signed-out visitor to `/sign-in`, and data requests still get 401. A signed-in user sees the calendar at `/` as before.
- [x] On every account page (sign in, sign up, check e-mail, forgot and reset password) the mark above the card is a link to `/home`.

## Ontology
R3 is about data, and the landing page shows none, so the rule holds. Its sentence "any data request gets the sign-in page or 401" is no longer exact for the bare address. Proposed wording: "… gets the sign-in page (the bare address `/`: the landing page) or 401, and no data." The ontology is not changed here; the team decides.

## Out of scope
Remembering which page a signed-out visitor wanted and opening it after the sign-in; any change to `/home` itself.

## Done when
`src/lib/route-guard.test.ts`, `src/lib/route-guard-visitor-pages.test.ts`, `src/proxy.test.ts` and `src/proxy-visitor-pages.test.ts`: signed out, `/` goes to `/home` (also with a query), pages inside the app still go to `/sign-in`, data requests get 401. These four files held the old behaviour of `/` and were changed for this spec: `/` moved out of three lists of pages that go to the sign-in page, and two proxy checks now expect `/home`. `src/components/account/AccountCard.test.tsx`: the mark links to `/home`. `npm run check` passes. Tried by hand in a browser, signed out: `/` shows the landing page, `/goals` shows the sign-in form, the mark on the sign-in form leads back.
