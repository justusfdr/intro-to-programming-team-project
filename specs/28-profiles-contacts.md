# Spec 28: Profiles and contacts
Stage 1 of sharing, asked for by the owner. Branch `28-profiles-contacts`, from `main`. Plan: `docs/ontology.md` (`user`'s `display_name`, `profile_photo`, `contact_invitation`, `contact`, `contact_decline`, `set_display_name`, `upload_photo`, `remove_photo`, `invite_contact`, `answer_invitation`, `withdraw_invitation`, `remove_contact`, R42 to R46, the note on R3, section 7, A24, A25, the out-of-scope list; added 15 Nov 2026, spec 28, asked for by the owner; the team confirms with the merge). One additive migration: `supabase/migrations/20261203000000_profiles_contacts.sql`.

## Why
Later stages will let users share calendars (read only), focus charts and to-do lists with people they choose (specs 29 and 30). That needs the ground first: every user has a recognisable profile, and two users decide together that they know each other. This stage builds only that, and opens a narrow, controlled window between two users' data for the first time.

## What
- [x] A profile: a display name (1 to 40 characters after trimming, no control or invisible characters; until set, the part of the e-mail before the "@") and an optional photo (JPEG, PNG or WebP by its first bytes, at most 200,000 bytes, in the database). The browser crops to a square, scales to 256 × 256 on a canvas and encodes again; the server checks everything again. Without a photo, the initials in a circle (`Avatar`, sizes 24, 32, 64).
- [x] Who sees a profile (R43): the user, their contacts, and someone the user invited while the invitation is open. Everyone else gets "Not found"; the photo route answers one identical 404 for "no such user", "not your contact" and "no photo", and serves photos with nosniff, a sandboxing content security policy and same-origin resource policy. The browser must ask again before each use (`private, no-cache`; changed from five minutes of caching after the security review of sharing), cheaply: an ETag from the photo's time and an empty 304 when it is unchanged, only after the same permission check.
- [x] Inviting by e-mail address (R44) with always the same answer, "If this person uses LockedIn, they will see your invitation."; refused only for the own address, a malformed address and the user's limits (20 open, 10 per hour in the database, 100 contacts); an in-memory brake per user and client on top. No account enumeration: the sender's list shows every address typed; the database swallows every error that depends on the address.
- [x] Answering (R45): accept (contacts) or decline (gone for the invited user; the sender is not told and is blocked for 30 days, silently); the sender withdraws.
- [x] Contacts (R46): one row per pair; either side removes; deleting an account removes its photo, invitations and contacts. `app.is_contact` for the policies of later stages, answering only for pairs that include the signed-in user.
- [x] Screens: a "Profile" card at the top of Settings; a page "People" (`/people`) with "Invite someone", "Invitations for you", "Invitations you sent" and "Your contacts", last in the sidebar's list with a badge of open invitations; not in the phone tab bar (a seventh icon does not fit at 375 px), reached from the Profile card there.
- [x] Database (additive): `app.profiles.display_name` with its check; the tables `profile_photos`, `contact_invitations`, `contact_declines`, `contact_invite_attempts`, `contacts`, all with row-level security and no write right for the user; every change through a narrow security definer function.

## Decisions
- The display name is written through `app.set_display_name`, not a column grant: there is still no write right on `app.profiles` (R6).
- An invitation to an address without an account, and one that was declined, stay as a row that only its sender sees (the address typed, the date). Without that, the sender's list would tell which addresses have accounts and who declined. Nobody else sees such a row, no e-mail is sent, and it never becomes an invitation by itself; inviting the same address again links it once the address has an account (and no decline blocks it).
- The sender can never read whether an invitation reached an account (the column `to_user` is not granted).
- Deleting an invited account keeps the sender's own row (the address they typed) without the link, so the sender is not told either.
- The hourly limit counts every invitation sent (a time only, never the address), also those to addresses without an account.
- Photos travel as base64 in JSON (no multipart parser) and are decoded in the database; the type is the bytes' own, also as a check on the table.

## Out of scope
Sharing calendars, focus charts and to-do lists (specs 29 and 30); inviting people who are not users yet and any e-mail about invitations; telling a sender that an invitation was declined; blocking a user; searching for users; names or photos anywhere else in the app; cropping by hand.

Still open: the reviewer applies the migration to the shared database and checks that `main` still works against it; tried by hand in a browser with two accounts (photo choice, canvas resize, upload, the badge, accept, decline, remove); the team confirms the ontology changes with the merge.

## Done when
All tests pass on a temporary database; existing server, database and rule tests unchanged. New: `test/db/profiles-contacts-schema.test.ts`, `src/lib/server/actions/profiles-contacts.test.ts`, `src/lib/server/pages/people-load.test.ts`, `src/lib/profiles/photo.test.ts`, `src/lib/profiles/display-name.test.ts`, `src/lib/client/resize-photo.test.ts`, `src/components/settings/ProfileCard.test.tsx`, `src/components/people/PeopleView.test.tsx`; the markup test `src/components/shell/AppShell.test.tsx` lists People. `npm run check` and `npm audit --omit=dev` pass.
