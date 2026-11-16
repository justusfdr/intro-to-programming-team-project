# Team project

Team project for Introduction to Programming at Nova SBE.

We build a web app that brings a calendar, goals with weekly rules and focus sessions together, and a Chrome extension that blocks distracting websites while the user works. Pro users also get an AI chat, typed or spoken, that plans their days and answers questions about how they spent their time. The app is called **LockedIn**.

**Status:** build steps 1 to 5 are complete in code: accounts, the week calendar with events, goals with weekly rules and progress, focus sessions, the blocker with its Chrome extension, analytics with the focus score, all-day and repeating events, and Outlook in both directions (specs 01 to 08). Outlook needs a Microsoft app registration (`docs/setup.md`, section 9); without it the app works without Outlook. Everything is deployed once the Supabase project exists (`docs/setup.md`).

## Run it
Needs Node.js 24 and npm.
1. `npm install`
2. Run the tests: `npm test` (a temporary in-process database and a fake sign-in service; no Supabase, no secrets).
3. Run all checks (lint, types, tests, build): `npm run check`
4. Run the app: `npm run dev`, then open http://localhost:3000. Signing in needs a Supabase project and `.env.local`; see `docs/setup.md`.
5. Look at the pages without signing in: `npm run build`, then `PREVIEW_OUT=/some/folder npm run previews` writes stand-alone HTML files with sample data (a development tool in `scripts/preview/`; the app never uses it).

## How we work
1. `docs/ontology.md` is the plan. Features are built from it, never the other way round. It changes only with the team's approval.
2. For each feature we write a spec in `specs/` with four parts: Why, What, Out of scope, Done when.
3. One branch per spec, named after it.
4. Tests come from the spec's What lines and cover accepted actions, rejected actions and edge cases. All tests pass before a merge.
5. Pull request, reviewed by another team member. Nobody merges their own pull request without a review.
6. Rules for coding agents are in `AGENTS.md`.

## Stack
- **Next.js with TypeScript:** pages and server code in one project; we used it for our first prototype. The teaching staff confirmed that languages other than Python are fine.
- **Supabase:** Postgres database and email-and-password login in one service; row-level security makes each user see only their own rows.
- **Vercel:** free hosting at a public URL, deployed from `main`.
- **Chrome extension (JavaScript):** a website alone cannot block other websites. The teaching staff called the extension a suitable idea.
- **Claude API:** the AI chat (plans days and answers questions about how the user spent their time), called only from our server.
- **Microsoft calendar API:** Outlook is the only calendar we connect.
- **Google Maps Platform (Places, Routes):** address suggestions, the time zone by city, and travel time to events.
- **Stripe in test mode:** payment for Pro without real money.

## Build order
We start with a small part that works end to end and grow it step by step. Each step is deployed.
1. Sign-up with e-mail confirmation and password reset, database with row-level security, events in the calendar (specs 01 and 02).
2. Goals, rules and goal progress.
3. Focus sessions, block list and the extension, then auto-block.
4. Analytics and focus score.
5. Outlook in both directions, all-day and repeating events.
6. AI chat, Stripe test mode and Pro.
7. Travel time. Settings last.

Between steps, spec 10 gives the screens the look of our first prototype (goals column, event editor, Analytics) without changing what the app can do.

After spec 10, spec 11 adds tasks under goals: a title, an optional due date, one goal or none ("Inbox"), open or done. They are listed under their goal (since spec 39 on the Goals page, `/goals`) and never count for a rule (ontology change of 12 Nov 2026).

A new account has an empty calendar and no goals; its block list starts with six sites the user can change. For the presentation we prepare demo accounts with example data; they are created and confirmed beforehand.

## Interface notes
- Goals and the AI chat ("Coach") are pages of their own, next to the calendar in the navigation (specs 19 and 39); the calendar has no side panels.
- Goal progress is shown as "this week x of y", a strip of weeks and a countdown, not as a line chart.
- The look follows our first prototype (spec 10): goals as open sections with a tinted tile, a thin bar and one row per rule; the event editor as a panel at the right with upper-case section labels, goal chips and a fixed footer. Every goal shows the same target icon in its colour (the data has no icon per goal). Collapsed goal sections are remembered in the browser only.
- Tasks are rows under each goal's rules and weeks, with a ring to mark them done, a date chip (red when overdue) and "Add task"; tasks without a goal are listed under "Inbox", the last card of the Goals page. The header of each goal shows its number of open tasks.
- When a chat message fails, the typed text stays in the input field.
- Settings are reworked last.

## Submission (to fill in)
- Deployed URL: _to be added_
- Team: Justus Friederichs (student number _to be added_), Lucas (_surname and student number to be added_), Emily (_surname and student number to be added_)
- Run the app locally: `npm run dev`
- Run the tests: `npm test`
- Secrets: they go into `.env.local`, which is never committed. `.env.example` lists their names. Supabase setup: `docs/setup.md`.
