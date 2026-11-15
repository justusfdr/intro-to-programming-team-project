# Spec 32: Demo contacts
Asked for by the owner. Branch `33-demo-contacts`, from `32-profile-page`. Plan: `docs/ontology.md` (`demo contact`, `user`'s `demo_contacts`, `set_demo_contacts`, `remove_demo`, R58, section 7, A33; added 15 Nov 2026, spec 32, asked for by the owner; the team confirms with the merge). One additive migration: `supabase/migrations/20261208000000_demo_contacts.sql`.

## Why
The owner: "With People one could add a test person, so one can try it with people, with test data. Otherwise that is a bit silly. Please build some demo contacts."

## What
- [x] Three made-up people in one file, `src/lib/demo/people.ts`: Lea Sousa (Lisbon; shares her calendar with details and her focus chart), Jonas Becker (Berlin; his calendar as free/busy), Maya Brooks (New York; nothing yet). Each has a bio, a LinkedIn link of the stored form with a `lockedin-demo-…` slug, a time zone, initials and a colour (no photos).
- [x] Their calendars come from one usual week (lectures, sport, a group meeting), placed at local times in their own zone for every week asked for; at free/busy blocks that touch are merged and carry no text (R48's shape). Lea's focus chart: the current week and the 7 before, cut in her zone, the days after today empty (R49's shape). No randomness.
- [x] Not accounts: no row in `auth.users`, `app.contacts`, `app.shares` or any other table. No database function returns them; the page loaders and the two read actions add them after the real rows.
- [x] People: "Add demo contacts" with one sentence while off; while on, the three after the real contacts with a "Demo" tag, their colour, a link to their page, the sharing controls disabled ("Demo contacts cannot see anything of yours"), what they share with "Show in calendar" / "View focus chart", and one "Remove demo contacts".
- [x] `/people/demo-lea` (and the other two): name, "Demo", bio, LinkedIn, time zone with the local time, no e-mail address.
- [x] Calendar: Lea and Jonas in the "People" picker (tagged) and as striped read-only blocks; they count towards R51's three. Analytics "Shared with you": Lea.
- [x] The ids `demo-lea`, `demo-jonas`, `demo-maya` are recognised exactly, before the uuid check, by `/people/[id]`, `GET /api/shares/[id]/calendar`, `GET /api/shares/[id]/focus` and the photo route (always the 404: no photos). With the choice off, "Not found" as for any unknown id.
- [x] Database (additive): `app.profiles.demo_contacts boolean not null default false`; `app.set_demo_contacts(boolean)` (security definer, empty search path, own row only). Still no write right on `app.profiles`.
- [x] Server: `POST /api/demo/contacts` `{ on }` (same origin, signed in, strict body, `withUser`).

## Decisions
- "Remove the demo data" in Settings (`remove_demo`, spec 13) also switches the demo contacts off, and Settings offers it while they are on (the confirmation now names them).
- The check of the window (62 days) for a demo calendar comes after the id is decided, so a demo id with the choice off answers "Not found" whatever window it asks for, as an unknown id.
- A demo contact's avatar is drawn from its own initials on its colour (`Avatar`'s `look`); a demo person never gets a photo, even if a photo address were passed.
- The People page's existing markup for real rows is unchanged; the demo rows add the tag and use the bio as their second line.
- Lists keep offering only real contacts (`readShareContacts` is not touched): a demo contact cannot be a list member.

## Out of scope
Changing the demo people, more of them, sharing something with them, invitations from or to them, demo lists.

Still open: the reviewer applies the migration to the shared database; tried by hand in a browser (add and remove, the three pages, the picker with three shown, Lea's chart, a real and a demo person together); the team confirms the ontology changes with the merge.

## Done when
All tests pass on a temporary database; existing server, database and rule tests unchanged. New: `test/db/demo-contacts-schema.test.ts`, `src/lib/demo/people.test.ts`, `src/lib/server/actions/demo-contacts.test.ts`, `src/components/people/DemoContacts.test.tsx`. `npm run check` and `npm audit --omit=dev` pass.
