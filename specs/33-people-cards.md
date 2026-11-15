# Spec 33: People as cards
Asked for by the owner. Branch `34-people-cards`, from `33-demo-contacts`. Plan: `docs/ontology.md` (R45, R46, R47, A34; changed 15 Nov 2026, spec 33, asked for by the owner; the team confirms with the merge). No database change.

## Why
The owner: "Profiles as cards. You invite people normally, but you can hover over a person; then a field opens with the contact. A person should not be shown with their e-mail address but with their name, for example 'Emily Lea', not the address. I hover over her, a field opens with the contact; I click it and see the information about her and also her calendar, if I may see it."

## What
- [x] Names, not addresses: contacts and inviters appear with avatar and shown name (display name, else the part of the address before the "@"). The address shows only on the person's profile page and in the hover card, in quiet text, where R43 allows. Sent invitations still show the address typed.
- [x] People page: "Invite someone" at the top, then the invitations for you and those you sent as compact rows, then the contacts as a grid of cards (1 column, 2 from 640 px, 3 from 1024 px): avatar (64), shown name, the bio's first line (cut with "…"), the local time with the city ("14:20 · Berlin", in the user's time format), small marks of what they share (calendar free/busy or details, focus chart). The whole card is one link to `/people/[id]`. Empty state and "Add demo contacts" (spec 32) as before.
- [x] `PersonChip` (avatar + shown name, a link to the profile): with something to show beyond id and name, a mouse resting on it (300 ms) or keyboard focus opens a hover card on the app's floating panel: avatar (48), name, bio line, local time, address where allowed, what they share, "Open profile" and, when they share their calendar, "Show in calendar". It closes when the pointer has left chip and card (after 150 ms), on Escape and when the focus leaves both; it never takes or traps the focus; touch has no hover (a tap follows the link). It loads nothing.
- [x] Profile page `/people/[id]`: under the card "What you share with <name>" (the controls moved from People, and "Remove contact" with its confirm step; for a demo contact disabled), "<name>'s week" (their shared calendar, read only, in the calendar's own week grid in a read-only mode, in their time zone, which is named, with "Shows free/busy only" or "Shows details", previous and next week, a details block opening the read-only card; or "<name> does not share their calendar with you"), and their focus chart when they share it (the Analytics chart). "Show in my calendar" adds them to the calendar's shown people (the same choice the People picker stores) and opens the calendar.
- [x] Phones (375 px): one column of cards; the profile's week keeps its width and scrolls sideways.

## Decisions
- No database change: the cards' bio and time zone come from `app.profile_card`, asked once for all contacts and inviters (`unnest($1::text[])` with a lateral call), so the database still checks R43 for each person. `app.contact_cards()` stays as it is.
- The new loader `loadPersonProfile` serves the profile page; `loadPersonPage` and `loadDemoPersonPage` return exactly what they did (their tests are unchanged).
- The week is drawn in the person's own time zone (it is "their week"); the hours are the user's visible hours, widened to every block.
- `TimeGrid` gained a read-only mode (every day at every width, labels without links, shared blocks across the whole column, nothing to create, drag or edit) instead of a second grid. `FloatingPanel` gained a passive mode for the hover card (no focus taken, no Tab trap, never a sheet).
- The chip is used for inviters on People and in the shared event's read-only card ("From <name>'s calendar", there only as a link: no card inside a card). The calendar's People picker keeps its checkbox rows (a link inside a checkbox label would be a trap) and Analytics keeps its headings; both already show avatar and name, never an address. Lists keep their members as they are (name and photo, never an address, R55; a list member who is not a contact has no profile to open).
- The hover card is reached by the keyboard on focus, but its links come after the page's content in Tab order (it lives in a portal); "Open profile" is the chip itself and "Show in calendar" is on the profile page too.

## Out of scope
Editing a contact from the card; hover cards inside other floating panels; a person's month view; sorting or searching contacts.

Still open: tried by hand in a browser (hover delay and closing, keyboard focus and Escape, touch, 375 px, the week's previous and next, "Show in my calendar" with three people already shown); the team confirms the ontology changes with the merge.

## Done when
All tests pass; existing server, database and rule tests unchanged. New: `src/lib/people/present.test.ts`, `src/lib/people/hover.test.ts`, `src/lib/server/pages/people-cards-load.test.ts`, `src/components/people/PeopleCards.test.tsx`. Rewritten markup tests: two tests of `src/components/people/PeopleView.test.tsx` (the inviter's chip, the contact's card), the last test of `src/components/people/ShareRow.test.tsx` (the row moved to the profile page), two tests of `src/components/people/DemoContacts.test.tsx` (spec 32's People tests, now on cards; the disabled controls checked on the profile page). `npm run check` and `npm audit --omit=dev` pass.
