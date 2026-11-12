# Spec 14: The calendar's header, Day and Month views
**This branch (`prototype-style`) is a variant for the team to compare with `main`.** It turns the app, step by step, into a copy of our first prototype's screens, with only the changes the owner decided. This is step 4a. Plan: `docs/ontology.md` (R37, `default_view` in section 3, `update_settings`, added on this branch 12 Nov 2026). Migration: `supabase/migrations/20261121000000_default_view.sql` (additive: `main` runs against the same database).

## Why
The prototype's calendar has a title that jumps to any date, a toolbar of round buttons and a Day | Week | Month switch; on phones it opens on one day. The rebuild had the week only, a text "Goals" button and a black "New event" pill, and on phones no way to see a month.

## What
- [ ] Header as in the prototype: the title (month and year; "Nov – Dec 2026" for a week across two months) is a button that opens a small month calendar to jump to a day. Below it: the week "Week 47 · Nov 16 – 22", the day "Wednesday, Nov 18 · Week 47" ("Wed, Nov 18 · Week 47" on phones), the month nothing more. The Outlook chip on the right.
- [ ] Toolbar in the prototype's order and shapes: round goals toggle (target icon), previous and next, "Today", Day | Week | Month, round "+" for a new event. The toggle and "+" show their word once the calendar column is wide, as in the prototype. Left out as decided: plan week, plan strength, the coach toggle.
- [ ] Day view: one day in the time grid with the same blocks and marks as the week, the prototype's strip of the week's seven days above it. A day header in the week view opens that day.
- [ ] Month view: the 6 × 7 grid; rows "7:30am Title" with the goal's colour dot, all-day events first without a time, "+2 more"; only dots on phones; a click on a day opens the day view.
- [ ] Every event on each day it touches (R37), in all three views, also an event that started the day before the first shown day.
- [ ] View and day in the address (`/?view=month&date=2026-11-18`; the older `/?week=` still works). The page reads exactly the shown days, in its one read transaction (at most 2 transactions, the counting test).
- [ ] Settings > Preferences: "Default view" Day, Week, Month (default Week), saved at once through `update_settings` (`defaultView`); any other value is an invalid request.
- [ ] Keys D, W, M, T, ← →; not while typing in a field, in a side column, or while a dialog is open. Phones get day and month only.

## Out of scope
Dragging in the grid (create, move, resize), the undo toast, the small new-event popover and the prototype's marks on blocks (step 4b); the search palette and the shortcuts help; a week that starts on Sunday; seasons in the subtitle.

## Done when
All tests pass on a temporary database; server, database and rule tests unchanged (new ones added: `src/lib/server/events/calendar.test.ts`, `src/lib/events/views.test.ts`, `test/db/default-view-schema.test.ts`, new cases in `update-settings.test.ts`); the calendar markup test is rewritten in the same commit as the change of look. `npm run check` and `npm audit --omit=dev` pass. Previews of day, week and month at desktop and phone width read as the prototype's `desk-02-calendar.png`, `desk-04-month.png` and `phone-01-calendar.png`. Reviewed by another member; the team decides between this branch and `main`.
