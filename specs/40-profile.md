# Spec 40: The user's own profile
Branch `42-profile-only`, from `main`. Asked for by the owner, 15 Nov 2026; the team confirms with the merge. Ontology: `user`'s `display_name`, `bio` and `linkedin_url`, `profile_photo`, `save_profile`, `upload_photo`, `remove_photo`, R42, R43, section 7, A24 and the out-of-scope list.

## Why
The owner wants each user to have a profile of their own in LockedIn now: a name to be greeted by in the sidebar, a photo, a short line about themselves and a LinkedIn link. Seeing other users' profiles is a team decision that has not been taken, so this spec is the profile alone and only the user sees it.

## What
- [x] A page `/profile`, signed in only. At the top: the avatar (photo or initials), the shown name and the e-mail address, with "Sign out" at the top right.
- [x] One card "Profile" with the sentence "Only you see your profile." and:
  - the photo: "Change photo" (then the dialog "Position your photo": drag, arrow keys with Shift for larger steps, zoom with a slider, its minus and plus buttons, or "+" and "-", from "fits" to 4 times, a 64 px round preview; "Cancel" or Escape changes nothing, "Use photo" uploads), and "Remove" while there is one;
  - display name (1 to 40 characters; until one is set, the part of the address before the "@"), bio (up to 160 characters, one line), LinkedIn link (only `https://www.linkedin.com/in/<name>`, turned into that form from what people paste: with or without `http(s)://`, `www.` or a country host, a trailing slash, query or fragment);
  - the time zone from the settings with the local time there, read only, and "Change in Settings";
  - one Save button (with Discard) that shows when a field changed; a refusal shows at its field.
- [x] The browser, the server and the database check every field with the same rule; the photo's type is decided from its first bytes, at most 200,000 bytes; the browser cuts the placed square to 256 × 256 and encodes it again, which drops location data.
- [x] The sidebar's bottom group is Pricing, Settings, then the user's avatar and shown name linking to `/profile` ("Sign out" leaves the sidebar). Folded, the avatar alone, named for screen readers. Phones: a row "Your profile" at the top of Settings; no new tab (the tab bar already holds seven icons).
- [x] Server: `POST /api/profile` (save), `GET /api/profile` (only the shown name and photo address, for the sidebar), `POST /api/profile/photo` and `/api/profile/photo/remove`, `GET /api/profiles/[id]/photo` for the user's own id, and the loaders of `/profile` and `/settings`, through `app.set_profile`, `app.set_profile_photo`, `app.remove_profile_photo`, `app.profile_photo` and `app.profile_card`.
- [x] The database files of the branches that came before this one (`20261203000000` to `20261211000000`) are in the repository unchanged, with their schema tests, because the shared database already has them. Their tables for contacts, shares, lists and invitations are not used by the app (docs/setup.md).

## Decisions
- Only the user sees their profile (R43). The photo route answers any id but the user's own with the same 404 as an unknown id, before the database is asked, because the shared database may hold rows from other branches that its function would honour.
- The readers ask `app.profile_card` for `auth.uid()` inside the database, so they cannot be pointed at anyone else.
- The photo is served as an image that can never run as a page (its stored type, `nosniff`, a policy that allows nothing and sandboxes it, same-origin embedding only) and is asked for again before each use (`private, no-cache` with an ETag).
- A saved photo is already cut; to move it, the user chooses the picture again.
- The time zone is changed only in Settings; the profile shows it.
- The separate "set display name" action of the earlier branch is not brought over: the one Save button saves the name with the rest.

## Out of scope
Seeing other users' profiles (prepared in the database, not in the app); contacts, invitations, People, sharing and anything else about other users; changing the time zone on the profile; cropping a saved photo again without choosing it.

## Done when
`src/lib/server/actions/profile.test.ts` (save, photo upload and removal, the photo route's one 404 also for another real user's id, the sidebar's card and the loaders with allow-lists of keys), the pure tests in `src/lib/profiles/`, `ProfileView.test.tsx`, `PhotoDialog.test.tsx`, the rewritten `AppShell.test.tsx`, the schema tests in `test/db/` and every other test pass unchanged; `npm run check` and `npm audit --omit=dev` pass. Tried by hand in a browser at 375 px, 768 px and 1280 px. Reviewed by another member; merged only after the owner confirms.
