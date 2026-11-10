# Team project

Team project for Introduction to Programming at Nova SBE.

We build a web app that brings a calendar, goals with weekly rules and focus sessions together, and a Chrome extension that blocks distracting websites while the user works. Pro users can also plan a day with an AI planner by typing or speaking. The app has no name yet.

**Status:** this repository currently holds the plan (`docs/ontology.md`). The code follows.

## How we work
1. `docs/ontology.md` is the plan. Features are built from it, never the other way round. It changes only with the team's approval.
2. For each feature we write a spec in `specs/` with four parts: Why, What, Out of scope, Done when.
3. One branch per spec, named after it.
4. Tests come from the spec's What lines and cover accepted actions, rejected actions and edge cases. All tests pass before a merge.
5. Pull request, reviewed by another team member. Nobody merges their own pull request without a review.
6. Rules for coding agents are in `AGENTS.md`.

## Stack
- **Next.js with TypeScript:** pages and server code in one project; we used it for our first prototype. The teaching staff told us orally that languages other than Python are fine; we have no written approval.
- **Supabase:** Postgres database and email-and-password login in one service; row-level security makes each user see only their own rows.
- **Vercel:** free hosting at a public URL, deployed from `main`.
- **Chrome extension (JavaScript):** a website alone cannot block other websites. The teaching staff called the extension a suitable idea.
- **Claude API:** the AI planner, called only from our server.
- **Microsoft calendar API:** Outlook is the only calendar we connect.
- **openrouteservice (OpenStreetMap data):** travel time to events.
- **Stripe in test mode:** payment for Pro without real money.

## Build order
We start with a small part that works end to end and grow it step by step. Each step is deployed.
1. Sign-up, database with row-level security, events in the calendar.
2. Goals, rules and goal progress.
3. Focus sessions, block list and the extension, then auto-block.
4. Analytics and focus score.
5. Outlook connection.
6. AI planner, Stripe test mode and Pro.
7. Travel time. Settings last.

A new account has an empty calendar and no goals; its block list starts with six sites the user can change. For the presentation we prepare a demo account with example data.

## Interface notes
- Panels next to the calendar (goals, planner) can be collapsed and expanded.
- Goal progress is shown as "this week x of y", a strip of weeks and a countdown, not as a line chart.
- Settings are reworked last.

## Submission (to fill in)
- Deployed URL: _to be added_
- Team: Justus Friederichs (student number _to be added_), Lucas (_surname and student number to be added_), Emily (_surname and student number to be added_)
- Run the app locally: _command to be added_
- Run the tests: _command to be added_
- Secrets: they go into `.env.local`, which is never committed. `.env.example` will list their names once the code lands.
