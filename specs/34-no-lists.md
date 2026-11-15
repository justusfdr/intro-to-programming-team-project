# Spec 34: The shared lists leave the app
Decided by the owner. Branch `35-no-lists`, from `34-people-cards`. Plan: `docs/ontology.md` (`list`, `list_member`, `list_entry`, their actions, R52 to R57 and A29 to A31 marked withdrawn; the scope line, R3, R22, R43, R58, section 7 and the out-of-scope list; withdrawn 15 Nov 2026, spec 34, decided by the owner; the team confirms with the merge). One migration that only takes rights away: `supabase/migrations/20261209000000_lists_closed.sql`.

## Why
The owner: shared to-do lists do not fit an app that is a calendar for focusing; they are a team task tool, a different app. They were never merged to `main` and no user has one.

## What
- [x] Removed from the code: the pages `/lists` and `/lists/[id]`, the routes under `src/app/api/lists/**` and `src/app/api/list-entries/**`, the actions (`src/lib/server/actions/lists.ts`), the server readers and refusals (`src/lib/server/lists/**`), the page loaders `loadListsPage` and `loadListPage`, `src/lib/lists/**`, the components (`src/components/lists/**`), the list messages, the "Lists" item in the sidebar (`nav.ts`, `Sidebar.tsx`) and the "Shared lists" link in the goals panel, with the tests that belonged to them.
- [x] Kept: the rule for text other people see, which the profile's bio uses, moved from `src/lib/lists/text.ts` to `src/lib/text/shown-text.ts` (`cleanShownText`); its test runs with the same table of examples.
- [x] Database: nothing is dropped. The new migration revokes `execute` on the thirteen list functions a user could call (`create_list`, `rename_list`, `delete_list`, `add_list_member`, `remove_list_member`, `leave_list`, `add_list_item`, `rename_list_item`, `tick_list_item`, `move_list_item`, `delete_list_item`, `list_people`, `can_use_list`) and every right on `app.lists`, `app.list_members` (also the column right) and `app.list_items` from `public`, `anon` and `authenticated`. `app.list_text_valid` stays callable (the bio's check). `app.may_see_profile` keeps its definition: its list condition can never be true without rows.
- [x] Tests: `test/db/lists-closed-schema.test.ts` shows a signed-in user is refused every list function and every list table, nothing changes, the tables and functions still exist, and the bio, the text rule and contact cards still work.

## Decisions
- The two schema test files of spec 30 and the sharing hardening (`shared-lists-schema.test.ts`, `sharing-hardening-schema.test.ts`) moved unchanged to `test/db/_closed/`, which `vitest.config.mts` leaves out; the folder's README says why and how to bring them back. The parts of the hardening file that do not need the lists (fixes 1 to 3, the file that stops on a broken name, the rights) run on in `test/db/sharing-hardening-kept-schema.test.ts`, with `add_list_member` and `leave_list` now expected closed.
- Tests that came with specs 30 to 33 and used the lists lost only their list cases: the one list case of `test/db/profile-page-schema.test.ts`, the fix 7 cases of `src/lib/server/actions/sharing-hardening.test.ts`, the list-member refusals in `src/lib/server/actions/demo-contacts.test.ts`. The app shell's markup test (from `main`) was rewritten back to the navigation without "Lists".
- Earlier specs (30, 32, 33) stay as they were written: they are a record.

## Out of scope
Dropping the list tables or functions (the shared database and the migration history keep them).

## Done when
`npm run check` passes; `npm audit --omit=dev` shows nothing; the reviewer applies the migration to the shared database.
