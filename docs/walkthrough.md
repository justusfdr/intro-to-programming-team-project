# Repository walkthrough notes

How LockedIn is built, why, and where its limits are. Paths are given so each part can be opened while reading.

## 1. How the repository is organised

We build in one direction: **ontology → specs → tests → code**.

- **Ontology** (`docs/ontology.md`): the plan. Concepts, data model, actions, numbered rules (R1, R3 …), what is saved where, and what the user sees when a service is down (section 7). It changes only with the team's approval (`AGENTS.md`).
- **Specs** (`specs/`): one file per feature, with Why, What, Out of scope and Done when. One branch per spec, named after it.
- **Tests**: next to the code (`src/**/*.test.ts(x)`), plus `test/db/` (database schema and row-level security), `test/repo/` (checks on the code itself) and `extension/**/*.test.js`.
- **Code**:
  - `src/app/`: pages and the thin API routes (`src/app/api/...`).
  - `src/lib/server/actions/`: one file per action (create_event, add_blocked_site, send_message …). This is where the rules are checked.
  - `src/lib/server/<service>/`: one module per external service (`db`, `auth`, `claude`, `outlook`, `google`, `stripe`, `weather`).
  - `src/components/`: the React screens.
  - `supabase/migrations/`: the database schema, one SQL file per step, run in name order.
  - `extension/`: the Chrome extension (plain JavaScript, Manifest V3).
- **Docs**: `docs/setup.md` (Supabase, Microsoft, Claude, Stripe, Google), `docs/security.md` (dependency audit) and this file.

## 2. One request from the browser to the database: create_event

1. The user saves the event editor. `src/components/calendar/EventEditor.tsx` sends `POST /api/events` with JSON (title, local start and end, goal, location …). Empty titles and impossible times are stopped on the screen first (`src/components/calendar/editor/useEventSave.ts`), but the server checks everything again.
2. `src/proxy.ts` runs before every request: it refreshes the Supabase session cookie and answers 401 to signed-out data requests (`src/lib/route-guard.ts`).
3. `src/app/api/events/route.ts` is a thin wrapper. It calls `createEvent` with the real services (`realDeps` in `src/lib/server/deps.ts`).
4. `src/lib/server/actions/create-event.ts` does, in order:
   - `assertSameOrigin` (`src/lib/server/http.ts`): Host must be our own address; Origin and Sec-Fetch-Site must be same-origin. Stops cross-site requests.
   - `requireUser` (`src/lib/server/session.ts`): the signed-in user's id from Supabase Auth, or 401.
   - `readJson(request, EventFields)`: size limit and the shape check with zod (`src/lib/server/events/input.ts`).
   - `deps.withUser(userId, …)` (`src/lib/server/db/with-user.ts`): one transaction, run as the database role `authenticated` with the user's id, with a 10-second statement limit.
   - Inside: read the user's time zone, `checkEventFields` (title 1–100 characters, end after start, at most 24 hours …), check the goal is the user's own, then `insert into app.events`.
5. The database checks again: column grants, check constraints and row-level security policies (`supabase/migrations/20261112000000_events.sql`). `user_id` defaults to `auth.uid()`, so a user cannot write a row for someone else.
6. The answer is `201` with "Event saved." A rejected rule throws `ActionError`; `handleAction` (`src/lib/server/errors.ts`) turns it into `{ error, message }` with the ontology's exact text, and the transaction rolls back, so nothing is saved (R1).

The same pattern (same-origin, signed in, zod, withUser, one answer per outcome) is used by every action. `create-event.ts` says so in its first comment.

## 3. Where data is stored and who may read it

- **Supabase Postgres**, in our own schema `app` (`supabase/migrations/20261111000000_accounts.sql`). Supabase's data API does not expose this schema, so **the browser never talks to the database**; only our server does.
- The server connects with `DATABASE_URL` (`src/lib/server/db/index.ts`) and runs every query through `withUser`, as the role `authenticated` with the user's id. **Row-level security** policies (`using (user_id = (select auth.uid()))`) limit each query to that user's rows (R3).
- Grants are minimal: for example a user may read their profile but never write `plan`. The plan is written only by `src/lib/server/db/billing.ts`, after a Stripe message whose signature was checked (`src/lib/server/stripe/signature.ts`, R6).
- `withUser` refuses statements that would switch role or identity (`FORBIDDEN` in `with-user.ts`), as a second safety net.
- **Passwords**: only in Supabase Auth, as a hash. **Outlook access**: encrypted with AES-256-GCM (`src/lib/server/outlook/box.ts`), read only by the server. **Card details**: only at Stripe. **Extension**: the block list and state in Chrome's storage on that computer (`docs/ontology.md`, section 7).
- What goes to Claude is listed in R22; guests, notes, profile and routine places are never sent (section 7).

## 4. External services and what the user sees when one is down

Each service has one module under `src/lib/server/` and a fake for tests. Every call has a time limit; the app does not crash.

| Service | Module | Time limit | The user sees |
|---|---|---|---|
| Supabase database | `db/` | 10 s per statement | "Your data cannot be loaded right now." (`src/app/error.tsx`, `errors.ts`) |
| Supabase sign-in | `auth/` | Supabase's own limit | "Signing in is not available right now. Try again later" |
| Claude | `claude/client.ts` | 60 s, one retry | "The assistant is not available right now. Your calendar is unchanged" |
| Outlook (Microsoft Graph) | `outlook/` | 10 s per call | Imported events stay, "Last synced …"; "Not sent to Outlook" on app events |
| Google Places and Routes | `google/` | 5 s / 8 s, daily call limit | "Travel time not available"; the event is still saved |
| Stripe (test mode) | `stripe/client.ts` | 10 s | "Payment is not available right now." Plan unchanged |
| Open-Meteo weather | `weather/open-meteo.ts` | 5 s | "Weather not available" |

Note: the ontology says "calls give up after 10 seconds"; in the code Claude gets 60 seconds, because an answer can take that long (`claude/client.ts`).

Without a key in the environment the feature switches itself off: no Claude key means the coach says it is not available; no Microsoft keys means no Outlook (`.env.example`).

## 5. How the tests work

- `npm test` runs Vitest (`vitest.config.mts`). There are about 350 test files (`git ls-files | grep -c "\.test\."` on 22 Nov 2026), all passing on `main`.
- **Temporary database**: every test file starts PGlite, an in-process Postgres, and runs the same migration files as Supabase plus a small shim for Supabase's `auth` schema (`test/db/harness.ts`, `test/db/supabase-shim.sql`). So row-level security and constraints are tested for real.
- **Fakes**: `test/support/app.ts` wires a fake sign-in (`auth/fake.ts`), fake Claude (`claude/fake.ts`), fake Outlook (`outlook/fake.ts`), fake Stripe (`stripe/fake.ts`), fake routing and weather, and a clock we can move. Tests never call real services and need no secrets.
- **Accepted and rejected**: each rule has a test for both. For a rejection the test compares a snapshot of every table before and after, to prove nothing changed (R1, `snapshot()` in `test/support/app.ts`).
- **Repository checks** (`test/repo/`): no secret in the code, Claude called from one module only, security headers, and a check for a JSON-parameter bug the test database cannot see.
- **On GitHub**: since 18 Nov 2026 lint, typecheck and all tests run on every push to `main` and on every pull request (`.github/workflows/ci.yml`); a run takes about 9 minutes.
- **Not tested, honestly**:
  - The real services (Supabase, Claude, Microsoft, Google, Stripe, Open-Meteo); only their fakes and request shapes.
  - No browser end-to-end tests: the screens have component tests (about 60 `.test.tsx` files), but no test clicks through the deployed site. We tested that by hand (QA of 18 Nov).
  - PGlite is close to Supabase's Postgres but not identical (`test/repo/jsonb-params.test.ts` exists because of one difference).
  - The Chrome extension has only 3 test files; blocking in Chrome itself is tested by hand.

## 6. Security measures in the code

- **Same-origin check** on every request that changes data (`assertSameOrigin`, `src/lib/server/http.ts`); the extension's requests are recognised by their `chrome-extension://` origin (`src/lib/server/blocker/extension-request.ts`).
- **Session check on the server** in every action (`requireUser`) and in `src/proxy.ts`; permissions are never checked only on the screen.
- **Row-level security** and minimal grants in the database (section 3).
- **Input validation** with zod for every body, then the ontology's rules, then the database constraints again.
- **Rate limits**: sign-in, sign-up, password reset and resend confirmation (`src/lib/server/actions/account-limits.ts`), address search (`search-places.ts`), and a daily Google call limit (`google/daily-limit.ts`). Honest limit: counts live in each server instance's memory (`rate-limit.ts`).
- **Secrets only in environment variables** (`.env.example` has names only; `.env.local` is never committed). All variables are server-only.
- **Stripe webhooks** are verified with an HMAC signature and a constant-time compare (`stripe/signature.ts`).
- **Security headers** in `next.config.ts`: no framing, `nosniff`, HSTS, a partial Content-Security-Policy.
- **Dependencies**: 12 runtime packages, exact versions in `package.json`; `npm audit` found 0 vulnerabilities on 18 Nov 2026 (`docs/security.md`).

## 7. Known limits

LockedIn is built for a course project with a small number of users. Before a public launch we would change these points:

- **Cost of the Claude API.** The coach allows 100 messages per user in 24 hours (`CHAT_MESSAGES_PER_DAY`, `src/lib/chat/access.ts`). Deleting a chat deletes its messages, so the count can be reset; for real users we would add a counter that survives deleted chats and a monthly budget alert.
- **Cost of Google Maps.** Address search and travel time are paid per call. The server already stops after a daily number of calls (`GOOGLE_MAPS_DAILY_LIMIT`, `google/daily-limit.ts`); for a launch we would add a limit per user and billing alerts in Google Cloud.
- **Rate limits per server instance.** The counters live in each server's memory; with many servers they would need a shared store.
- **Payment in test mode only.** Stripe runs in test mode, so no real money moves.
- **Built for a laptop screen.** The layout is not finished for phones.
- **The Chrome extension is loaded by hand** (downloaded in Settings), not from the Chrome Web Store.
- **Outlook is the only calendar** we connect, and it works with personal Microsoft accounts; university accounts block the connection.

## 8. Likely questions

1. **Where is the data stored?**
   In Supabase Postgres, schema `app`. Only our server connects; every query runs as the user, so row-level security shows each user only their rows.
2. **What happens if an external API is down?**
   Each call has a time limit and a fixed message from ontology section 7, for example "Travel time not available". Nothing is half-saved, and the rest of the app keeps working.
3. **What do the tests cover, and what not?**
   Actions, rules (accepted and rejected), the database schema and RLS, with a temporary Postgres and fakes; GitHub runs them on every pull request. Not the real services, and not the deployed site in a browser.
4. **How do you stop one user reading another user's events?**
   The browser cannot reach the database. The server runs each query as that user (`withUser`), and the RLS policies compare `user_id` with `auth.uid()`; tests in `test/db/` check it.
5. **Why Next.js and not Python?**
   Pages and server code in one project, and our first prototype used it. The teaching staff confirmed other languages are fine (`README.md`).
6. **Why a Chrome extension?**
   A website cannot block other websites. The extension asks our server every 30 seconds whether a session is running and blocks the list only then.
7. **Where are the API keys?**
   Only in environment variables on Vercel and in `.env.local`, never committed. A repository test checks the code for secrets.
8. **How does the coach avoid changing the calendar by mistake?**
   Claude only returns a draft. Our checks run on it (R23); one failure rejects it. The calendar changes only when the user accepts, and the draft can be undone.
9. **What would you change with more time?**
   Browser end-to-end tests, a full Content-Security-Policy, rate limits shared across servers, and the cost limits for Claude and Google Maps from section 7.
10. **How did you work as a team and use AI tools?**
    Mostly in joint working sessions: we planned the ontology and specs together, built each feature on its own branch with Claude as the coding agent, and went through and tested the changes together before they reached `main`. The team decided what to build and which rules apply; `AGENTS.md` says what the agent may and may not do.
