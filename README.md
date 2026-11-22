# LockedIn

Team project for Introduction to Programming at Nova SBE (2026/27).

**Deployed app:** https://intro-to-programming-team-project.vercel.app

## Team

| Name | Student number |
|---|---|
| Lucas Strobel | 78177 |
| Justus Friederichs | 81107 |
| Emily Drescher | 78181 |

## What it is

LockedIn is a calendar for students who want to stay focused. It brings planning, goals and focus time into one web app, so a goal is not only written down but ends up as time in the calendar.

- **Calendar:** day, week and month view; events with place, notes, to-dos, guests, all-day and repeating events; drag to create and move, with undo.
- **Outlook:** events sync in both directions with a personal Microsoft account.
- **Goals:** a deadline and weekly rules ("3 sessions a week"); progress counts from the calendar; tasks under each goal.
- **Coach:** an AI chat (Claude API) that plans days and weeks as a draft. The calendar changes only when the user accepts the draft.
- **Focus sessions and blocker:** a timer, and a Chrome extension that blocks distracting sites while a session runs.
- **Travel time:** when to leave for an event, by car, bike, on foot or by public transport (Google Maps).
- **People:** contacts, shared calendars (free/busy or details, read only) and event invitations inside the app.
- **Analytics:** weekly numbers per goal, focus score, streaks, and a PDF export.
- **Also:** sidebar widgets (weather, next event, goal progress), a landing page, and a Pro plan paid with Stripe in test mode.

Every user has their own account and sees only their own data, unless a contact shares a calendar or sends an invitation.

## Run it locally

Needs Node.js 24 and npm.

```
npm install
npm test        # all tests; needs no database, no keys
npm run dev     # the app at http://localhost:3000
```

- `npm test` starts a temporary in-process database for each test file and uses fakes for every external service, so it runs on a fresh copy without any setup.
- `npm run dev` starts the app, but signing in needs a Supabase project and a `.env.local` file. `.env.example` lists every variable; `docs/setup.md` explains each step.
- `npm run check` runs lint, type check, tests and a production build in one go.

## Where things are

| Path | What is there |
|---|---|
| `docs/ontology.md` | The plan: concepts, data model, actions and numbered rules (R1, R2 …). Features are built from it. |
| `specs/` | One file per feature: Why, What, Out of scope, Done when. |
| `docs/walkthrough.md` | How the project is built, why, its limits and what we would change. Start here for the repository review. |
| `src/app/` | Pages and the thin API routes. |
| `src/lib/server/actions/` | One file per action (`create-event.ts`, `send-message.ts` …). The rules are checked here. |
| `src/lib/server/<service>/` | One module per external service: `db`, `auth`, `claude`, `outlook`, `google`, `stripe`, `weather`. |
| `src/components/` | The screens. |
| `supabase/migrations/` | The database schema with row-level security, one SQL file per step. |
| `extension/` | The Chrome extension. |
| `test/`, `src/**/*.test.ts(x)` | About 330 test files. `.github/workflows/ci.yml` runs them on every pull request and on `main`. |
| `AGENTS.md` | Rules for the coding agents we worked with. |

## How we worked

We started with a small prototype that ran only in the browser, to try out the basic ideas. For the design we had Claude build several mock-ups, picked the best one as a team, and gave it back to Claude together with the prototype, our notes and the plan (`docs/ontology.md`) to build the app from.

1. We wrote the plan first (`docs/ontology.md`) and extended it with every new feature. Each addition has a date and a reason.
2. Each feature got a spec in `specs/` and a branch.
3. Tests come from the spec and cover accepted actions, rejected actions and edge cases.
4. Changes reach `main` through pull requests; lint, type check and all tests run on each one. Most of the work happened in joint working sessions, where we went through and tested changes together at one screen. That is why many pull requests have no separate review on GitHub.
5. We built with coding agents (Claude). The team decided what to build and which rules apply; `AGENTS.md` says what the agents may and may not do.

## Stack and why

- **Next.js with TypeScript:** pages and server code in one project. The teaching staff confirmed that a language other than Python is fine.
- **Supabase:** Postgres database and e-mail-and-password login in one service. Passwords are stored only there, as a hash. Row-level security lets each user read only their own rows, and only our server talks to the database.
- **Vercel:** hosting at a public URL, deployed from `main`.
- **Chrome extension:** a website cannot block other websites, so the blocker has to be an extension.
- **Claude API:** the coach, called only from our server.
- **Microsoft Graph:** Outlook sync. **Google Maps Platform:** address search and travel time. **Open-Meteo:** weather. **Stripe (test mode):** the Pro plan, without real money.

All keys live in environment variables on the server. None is in this repository.

## Known limits

- **Built for a laptop screen.** The layout is not finished for phones.
- **The coach allows 100 messages per user in 24 hours.** The counter can be reset by deleting chats; for real users we would add a stricter counter and a monthly budget alert.
- **Outlook works with personal Microsoft accounts.** University accounts block the connection.
- **The extension is loaded by hand** (downloaded in Settings); it is not in the Chrome Web Store.
- **Tests use fakes for the external services**, and no test clicks through the deployed site in a browser. We tested that by hand.
- **Rate limits are counted per server instance**, not shared across all of them.
- **Payment runs in Stripe test mode only.**

More detail, and what we would change with more time: `docs/walkthrough.md`, sections 7 and 8.
