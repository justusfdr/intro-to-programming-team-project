# Spec 31: The profile page
Asked for by the owner. Branch `32-profile-page`, from `31-sharing-all`. Plan: `docs/ontology.md` (`user`'s `bio` and `linkedin_url`, `save_profile`, R42, R43, R3's exception (1), R46, section 7, A32; added 15 Nov 2026, spec 31, asked for by the owner; the team confirms with the merge). One additive migration: `supabase/migrations/20261207000000_profile_page.sql`.

## Why
The owner: "At the bottom I want Profile instead of Sign out: Pricing, Settings, then the name. That opens a whole page, with the Sign out button at the top right. At the top the profile picture and a kind of bio. It would be good to see another person's time zone, and something like a LinkedIn URL. The time zone should be stored with the person so that everyone can always see it."

## What
- [x] Sidebar, bottom: Pricing, Settings, then the user's avatar and shown name, to `/profile`. Folded: the avatar alone, the name as its label. "Sign out" leaves the sidebar. Phones: no new tab; Settings starts with the row "Your profile".
- [x] `/profile`: avatar (64), shown name, address, "Sign out" at the top right. One card: photo (change, remove), display name, bio, LinkedIn, and "Time zone: Europe/Lisbon · it is 2:20pm there" with "Change in Settings". Save and Discard appear only after a change (as in spec 17); a refusal shows at its field. "Your contacts and people you invite see your name, photo, bio, LinkedIn link and time zone." The way to People stays.
- [x] Bio: optional, 1 to 160 characters after trimming, one line, the rule of a list title (`app.list_text_valid` with 160), emoji allowed; empty clears it.
- [x] LinkedIn: optional, stored only as `https://www.linkedin.com/in/<slug>` (slug 3 to 100 of `A-Z a-z 0-9 - _ %`). Pasted forms (no scheme, `http://`, `linkedin.com`, `de.linkedin.com`, a trailing slash, a share-button query or fragment) are turned into it; everything else is refused. One function in browser and server, the same pattern as a check in the database, and again before rendering: a link with the word "LinkedIn", `target="_blank"`, `rel="noopener noreferrer nofollow"`.
- [x] Time zone: not copied; read from `app.settings` for the people R43 allows.
- [x] `/people/[id]`: another person's card, read only, for the user themselves (sent on to `/profile`), a contact or someone who invited them; one identical "Not found" for anyone else, a missing user or a malformed id. On People a contact's name links to it.
- [x] Database (additive): `app.profiles.bio`, `app.profiles.linkedin_url` with checks; `app.linkedin_url_valid`; `app.set_profile(text, text, text)` (security definer, empty search path, own row only); `app.profile_card(uuid)`. `app.set_display_name` and `app.contact_cards()` stay unchanged. Still no write right on `app.profiles`.
- [x] Server: `POST /api/profile` (save_profile: same origin, signed in, 16 kB body, zod, `withUser`, `handleAction`), `GET /api/profile` (the sidebar's name and photo only), loaders for both pages, answers checked against an allow-list of keys.

## Decisions
- `app.profile_card` checks R43's three conditions itself instead of `app.may_see_profile`, because that function also lets people who only share a list (R55) see each other; they keep name and photo inside the list but see nothing of the card. With these three conditions every row may carry the e-mail address.
- An empty name is allowed only while none was ever set (the form can save a bio before a name); a set name cannot be emptied, as before.
- `app.contact_cards()` is not extended: a function returning a table cannot gain columns with `create or replace`.
- The sidebar row asks `GET /api/profile` on pages that do not read the profile themselves (as the People badge does).

## Out of scope
Other links or fields; a bio over several lines; showing the profile to people who only share a list; changing the time zone on the profile page.

Still open: the reviewer applies the migration to the shared database and checks that `main` still works against it; tried by hand in a browser (sidebar folded and open, Save/Discard, refusals at the fields, a pasted LinkedIn link, the photo, `/people/[id]` for a contact, a stranger and a malformed id); the team confirms the ontology changes with the merge.

## Done when
All tests pass on a temporary database; existing server, database and rule tests unchanged. New: `test/db/profile-page-schema.test.ts`, `src/lib/server/actions/profile-page.test.ts`, `src/lib/profiles/linkedin.test.ts`, `src/lib/profiles/profile-fields.test.ts`, `test/support/linkedin-examples.ts`. Rewritten markup tests: `src/components/profile/ProfileView.test.tsx` (was `src/components/settings/ProfileCard.test.tsx`), the first test of `src/components/shell/AppShell.test.tsx`. `npm run check` and `npm audit --omit=dev` pass.
