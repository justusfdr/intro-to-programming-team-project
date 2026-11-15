# Spec 29: Sharing a calendar and the focus chart
Stage 2 of sharing, asked for by the owner. Branch `29-sharing-calendar`, from `28-profiles-contacts`. Plan: `docs/ontology.md` (`share`, `set_share`, `read_shared_calendar`, `read_shared_focus`, R47 to R51, R3 reworded, R22 confirmed, section 7, A26 to A28, the out-of-scope list; added 15 Nov 2026, spec 29, asked for by the owner; the team confirms with the merge). One additive migration: `supabase/migrations/20261204000000_shares.sql`.

## Why
The owner asked to "share calendars, with rights" and to "share the charts of the focus sessions". Stage 1 (spec 28) built contacts: two users who accepted each other. This stage lets a user choose, per contact, what that contact may see of their calendar and whether they see their focus chart. It is the first time one user reads a part of another user's rows, so it is narrow, read only and checked in the database.

## What
- [x] A share per owner and contact (R47): the calendar `none` (default), `busy` (blocks without any text) or `details` (title, time, place); the focus chart yes or no. Only the owner sets it; it hangs on the contact row and ends with it, in both directions.
- [x] A shared calendar (R48), for a window of at most 62 days: at `busy` only times, overlapping blocks merged; at `details` also title and place. Never notes, guests, organizer, to-dos, goal, travel mode, status, source, Outlook ids, series, ids, `updated_at`, and no demo events. Computed in the database at each request.
- [x] A shared focus chart (R49): 8 weeks of focused minutes and finished sessions and this week's minutes per day, in the owner's time zone, with R13's definition (the same as `src/lib/focus/session-time.ts`).
- [x] "Not found" alike for no share, not a contact and no such user.
- [x] Read only (R50): no route writes anything of the owner's; shared events are their own type on the screen, never dragged, edited, synced or sent to the coach (R22 tested).
- [x] People page: under each contact "You share with …" with Off / Free/busy / Details and a "Focus chart" switch, saved at once; a line with what they share and links "Show in calendar", "View focus chart".
- [x] Calendar: a "People" button (only when someone shares a calendar) to show up to 3 calendars (R51), remembered in the browser; striped, muted, read-only blocks with the person's avatar in the week, day and month views, beside the user's own; a `details` block opens a small read-only card. Read again when the days change and when the window gets the focus.
- [x] Analytics: "Shared with you" (only when someone shares a focus chart): pick a person, see their 8 weekly bars and this week's days, labelled with their name.

## Decisions
- Sharing nothing removes the row: no trace of a past share is kept.
- The busy level merges overlapping and touching blocks, so not even the number of events shows.
- A running session whose planned length has passed counts in a shared chart (it finishes by itself, R13), so the owner's chart and the viewer's agree without the owner opening the app.
- The focus chart's function takes its clock from the database; an internal variant with a fixed time (not callable by users) makes it testable.
- Shared blocks take the right part of a day column (38 %) only on days that have some; the user's own blocks keep the left part and all their behaviour.
- The address carries `?share=<id>` (calendar) and `?person=<id>` (analytics) for the People page's links; the server only passes them on, the database checks everything.
- New loader variants (`loadCalendarPageWithShares`, `loadAnalyticsPageWithShares`) read the people in the same one transaction; the existing loaders return exactly what they did.

## Out of scope
Editing, moving or answering other people's events; sharing with people who are not contacts; public links; groups; sharing to-do lists (spec 30); a shared calendar in the coach, in Outlook or in the conflict marks; history of what was shared when.

Still open: the reviewer applies the migration to the shared database; tried by hand in a browser with two accounts; the team confirms the ontology changes with the merge.

## Done when
All tests pass on a temporary database; existing server, database and rule tests unchanged. New: `test/db/shares-schema.test.ts`, `src/lib/server/actions/shares.test.ts`, `src/lib/shares/place.test.ts`, `src/components/calendar/Shared.test.tsx`, `src/components/people/ShareRow.test.tsx`, `src/components/analytics/SharedFocus.test.tsx`. `npm run check` and `npm audit --omit=dev` pass.
