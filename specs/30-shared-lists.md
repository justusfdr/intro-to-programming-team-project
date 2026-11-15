# Spec 30: Shared to-do lists
Stage 3 of sharing, asked for by the owner. Branch `30-shared-lists`, from `28-profiles-contacts`. Plan: `docs/ontology.md` (`list`, `list_member`, `list_entry`, `create_list`, `rename_list`, `delete_list`, `add_list_member`, `remove_list_member`, `leave_list`, `add_entry`, `rename_entry`, `tick_entry`, `move_entry`, `delete_entry`, R52 to R57, R3's second exception, R22's "not sent", section 7, A29 to A31, the out-of-scope list; added 15 Nov 2026, spec 30, asked for by the owner; the team confirms with the merge). One additive migration: `supabase/migrations/20261205000000_shared_lists.sql`.

## Why
People who live or work together keep the same small lists: the flat's shopping, what to pack for a trip, who brings what. Until now every row in the app belonged to one user. Stage 1 (spec 28) let two users accept each other as contacts; this stage lets them keep a list together, without touching the private goals and tasks.

## What
- [x] Lists of their own, next to the private goals and tasks: an owner, a title of 1 to 60 characters, at most 20 per owner; a list also works alone, as a personal checklist (R52).
- [x] Members from the owner's contacts only, at most 20; the membership hangs on the contact row, so ending the contact ends it in the same moment. Adding is immediate, and the Share panel says "<name> will see this list and its entries at once." A member leaves; the owner removes members, renames and deletes the list (R53).
- [x] Entries: 1 to 200 characters, done or open, in an order, at most 200 per list. Everyone of the list adds, renames, ticks, moves and deletes any entry; who added and who ticked it shows as a small avatar. Every change carries the entry's `updated_at`; a change made in the meantime refuses it with "Changed by someone else. Reload to see the latest version" (R54).
- [x] Only the owner and the members see a list; everyone else gets "Not found" for a foreign, missing or malformed id. People of a list see each other's display name and photo, never the address of someone who is not their contact (R55). `app.may_see_profile` gains this one condition; its old ones are unchanged.
- [x] Deleting a list, and an account (R56); the coach, Outlook and analytics never get lists (R57).
- [x] Screens: "Lists" in the sidebar after Goals (on phones through the goals panel: the tab bar has no room for a seventh icon), `/lists` with "New list", "by <name>", the open count and avatars, `/lists/[id]` with rename for the owner, Share or Leave list, tick rings, rename in place, arrow buttons to move, delete, "Add an entry", done entries dimmed at the end and "Hide done" (remembered in the browser). The page reads again on focus and every 20 seconds while visible; a refused tick goes back with its message.

## Decisions
- Every write goes through a security definer function that locks the list row first (then the entry), so counts, places and the `updated_at` check hold for two people at the same moment, and no two changes can deadlock. Users have no insert, update or delete right on the three tables; reading is row-level security through `app.can_use_list`.
- `add_list_member` takes the contact row's id and checks inside that the caller owns the list and is part of that contact row; any other row is "Not found".
- `updated_at` of an entry changes with its title, its tick and its own move, not when other entries close up around it, so moving one entry does not make everyone else's next tick "changed by someone else". Renaming a list carries the list's `updated_at` too.
- A member without a display name is shown by the part of the address before the "@" only to themselves and their contacts; to everyone else as "Member", because that part is part of an address.
- The Share panel shows the owner's contacts by name and photo, without their addresses.
- Moving is done with up and down arrow buttons (keyboard and touch alike); no drag.

## Out of scope
Due dates, assigning entries to people, comments, lists inside goals, sharing private goals or tasks, public links, inviting people who are not contacts, notifications about changes, live updates faster than the 20-second re-read.

## Done when
- [x] `npm run check` passes; `npm audit --omit=dev` shows nothing.
- [x] Every rule R52 to R57 has an accepted and a rejected test in `test/db/shared-lists-schema.test.ts` and `src/lib/server/actions/lists.test.ts`; existing server, database and rule tests are unchanged (the app shell's markup test lists the new item).
- [ ] The reviewer has applied the migration to the shared database and tried it with two or three accounts (A29 to A31).
