# Open tasks for the team

As of 12 November 2026. Each task stands on its own and can be built on its own branch.
Size: S = under an hour, M = a few hours, L = about a day (each with an AI coding agent).
"Prototype file" names a file in our first prototype's `src/` folder to copy the look and behaviour from
(the prototype is not in this repository; ask Justus for it).

## A. In the ontology, not built yet

| No. | Task | Size | What belongs to it | Prototype file |
|---|---|---|---|---|
| A1 | **Travel time ("Leave by")**, rule R27 | M | One module on the server for the routing service (openrouteservice, free key as an environment variable), with a fake for tests. Calculates `leave_at` from start, travel minutes and buffer. Shown as a line under the location in the event editor, with "© OpenStreetMap contributors". Home address, travel mode and buffer are in Settings already. | `lib/travel.ts`, `components/settings/TravelCard.tsx` |
| A2 | **Free and Pro with Stripe test payment**, rules R5, R6, R25 | L | Checkout in test mode; Stripe tells our server about the payment, and only then the plan becomes Pro. A "Billing" card in Settings and a pricing page. The spec is on the branch `09-plans`, together with an unfinished, unreviewed start. Only keys that begin with `sk_test_`; the browser never sets the plan. | `app/pricing/page.tsx`, `components/settings/BillingCard.tsx` |
| A3 | **AI chat** ("Coach"), rules R21 to R24 and R31 | L | Built on the branch `19-coach` (spec 19): the server, the database, the Claude module, and the Coach page (chat, drafts drawn as days, add or discard, voice in English and German, "What is sent?"). Left: "Pro only" waits for A2 (until then every signed-in user may use it, `CHAT_PRO_ONLY` off); a real Claude key with a spending limit on the server and a real conversation in English and German by the reviewer. | `components/coach/*`, `components/braindump/*` (still separate there) |

## B. Extras of the prototype that are not in the ontology

Each needs a short addition to the ontology first (on its branch), then the build.

| No. | Task | Size | What belongs to it | Prototype file |
|---|---|---|---|---|
| B1 | **To-dos inside an event** | M | A list in the event editor with the count "2/3", tick, reorder; the count also on the block in the calendar. Its own table, at most 20 per event. | `components/calendar/SubtaskList.tsx` |
| B2 | **Notes inside an event** | S | One text field in the event editor, up to 2,000 characters. | `components/calendar/fields.tsx` |
| B3 | **Rating an event** ("How did it go?") | S to M | 1 to 5 and Energizing / Neutral / Draining, once the event is done. | `components/calendar/fields.tsx` |
| B4 | **Goals page** `/goals` | M to L | A page with one card per goal: icon, status, "why", this week's progress, tasks. Without the trajectory chart. A "Goals" entry in the sidebar. | `app/goals/page.tsx`, `components/goals/GoalCard.tsx` |
| B5 | **Milestones** | M to L | A goal has milestones (title, date, done); tasks can sit under one. Best after B4. | `components/goals/MilestoneList.tsx` |
| B6 | **Focus page as in the prototype** | L | "Up next", a quick session with title and goal, the large ring with the goal's icon, the clock in the tab title, Space to pause, the session-complete screen with the break timer. Lengths stay 15, 30, 60, 90, 120 minutes. | `app/focus/page.tsx`, `components/focus/*` |
| B7 | **Focus sounds** | S to M | Noise, rain, ocean; remembered in the browser only. | `components/focus/SoundControl.tsx`, `lib/sound-engine.ts` |
| B8 | **Analytics as in the prototype** | L | Day / Week / Month, comparison with the previous period, a line chart of the focus score, bars per goal, "time by goal". | `app/stats/page.tsx`, `components/stats/*` |
| B9 | **Search** (⌘K) | M | A search field in the sidebar that finds events, tasks and goals. The search runs on the server and shows only the user's own rows. | `components/calendar/SearchPalette.tsx`, `lib/search.ts` |
| B10 | **Shortcut help** ("?") | S | A dialog that lists the keyboard shortcuts. | `components/shell/ShortcutsHelp.tsx` |
| B11 | **Order of goals** and "show completed" | S | Up and down arrows on goals; an eye button that shows done tasks. | `components/goals/GoalsPanel.tsx` |

## C. Setup without code

| No. | Task | Where it is described |
|---|---|---|
| C1 | **Register the app at Microsoft for Outlook.** Since June 2024 every registration must live in a directory; a purely personal account creates one first. | `docs/setup.md`, section 9 |
| C2 | **Our own e-mail sender and the e-mail templates in Supabase.** Without them only members of the Supabase team can sign up, and the link in the confirmation e-mail does not fit the app. | `docs/setup.md`, sections 3 to 5 and 7 |
| C3 | **Deploy on Vercel**, with the environment variables and the right address in Supabase. | `docs/setup.md`, section 6 |
| C4 | **Load the Chrome extension and test the blocker once.** | `docs/setup.md`, section 8, and `extension/README.md` |
| C5 | **README for the submission:** names, student numbers, the app's address; make the repository public before 23 November. | `README.md` |

## How to work on a task

- **Decide first** which variant stays: `main` or `prototype-style`. Branch off that one. A1 and A2 can start
  earlier: their server part is the same in both.
- **One branch per task**, named after it. First a short spec in `specs/` (Why, What, Out of scope, Done when),
  then the tests, then the code.
- **Tests need no keys:** `npm install`, then `npm test`. Before every push `npm run check`.
- **To try it in a browser** you need the file `.env.local` from Justus. It is never committed.
- **Do not touch** the existing tests of the server, the database and the rules. New database files may only
  add; they never change or remove what exists.
- **Names:** no other app's name and no old working title anywhere in the repository. The app is "LockedIn".
- **Security stays as it is:** the browser never talks to the database; every rule is checked on the server
  and in the database; keys live only in environment variables on the server.
- **Merge** only after we confirmed it together.

## Already built on `prototype-style` (do not build twice)

The sidebar and phone navigation, 12-hour times, the settings page, a colour and icon per goal, the demo week
with the welcome dialog, Day / Week / Month views, dragging events with undo, and the event editor's frame
(the card next to the block, each change saved at once, the location field). B1 to B3 and A1 add their
sections to that editor.
