# Live demo script

A draft for the team to adapt. The demo runs on the deployed app: https://intro-to-programming-team-project.vercel.app

The course wiki gives no time limit for the demo (checked 18 Nov 2026). We plan **8 minutes** and keep the coach steps optional. Ask the teaching staff for the real limit and cut steps if it is shorter.

Each step names the grading criterion it shows (`docs/grading-criteria.md`): **C1** It works, **C2** UI/UX, **C3** Scope, **C4** Verification, **C5** Security, **C6** Walkthrough.

## Before the demo

### The evening before
- Open the deployed URL and sign in. The free Supabase database pauses when it is idle; opening the app wakes it (`docs/ontology.md`, section 7).
- Check that `main` is what Vercel shows (latest deployment green in Vercel). Check before the demo.
- Click through every step below once on the deployed URL, with the account you will use.
- Check the open bugs that touch the demo path: #157 (dragging an event onto another and choosing "Discard" deletes it), #128 (same start and end time makes a 24-hour event), #121 (paying for Pro shows an error). Avoid these paths unless they are fixed.

### What to prepare
- **A demo account with data.** Created and confirmed beforehand (`README.md`). It should have: a week of events (some with a location), two or three goals with a routine, a few tasks, and past focus sessions so Analytics has numbers. The demo week (`/api/demo/load`, offered on the welcome screen) can fill an empty account.
- **Pro or not.** The coach needs Pro only if `CHAT_PRO_ONLY` is `true` on Vercel (`src/lib/server/config.ts`, issue #44). Find out which applies and whether the demo account is Pro. Check before the demo.
- **The Chrome extension in the current version.** Download it from Settings, "Focus blocker" (spec 18), so `config.js` holds the deployed address. Load it in `chrome://extensions` and check that Settings shows it as connected.
- **Two browser windows.** Window 1: the app, signed in. Window 2: a site on the block list (for example `instagram.com`), to show the blocker.
- **Outlook (optional).** If you show it, connect a test Microsoft account in Settings and press "Sync now" once the evening before.
- **No secrets on screen.** Close `.env.local`, the Vercel environment page and the Stripe dashboard before sharing the screen.

## The demo (about 8 minutes)

1. **Landing page, then sign in.** Open the URL signed out, scroll the landing page briefly, then sign in. Say: "LockedIn brings a calendar, goals and focus sessions together, with a blocker that stops distracting sites." (C2, C3)
2. **Rejected sign-in (optional).** Sign in once with a wrong password first. The app says "Email or password is wrong" and stays on the form. Say: "Wrong input is rejected with a clear message; repeated attempts are rate-limited." (C1, C5)
3. **Calendar week.** Show the week with events, goal colours and the sidebar widgets. Say: "Each event can belong to a goal, so goal progress counts automatically." (C2, C3)
4. **Accepted action: create an event.** Click an empty slot, type a title, pick a goal, add a location, save. The app says "Event saved." and the editor shows the travel time and when to leave. Say: "Travel time comes from Google's routing on our server, with our buffer added." (C1, C3)
5. **Rejected action: an all-day event that ends before it starts.** In the editor, switch to all day and set the last day before the first day, then save. The server answers "The last day cannot be before the first day" and nothing is saved. Say: "The server checks every rule, not only the screen; a rejected action changes nothing." (C1, C4) Try this in the rehearsal; the date picker is squeezed (#159). Check before the demo.
6. **Goals page.** Open `/goals`. Show one goal with its routine, "this week x of y" and its tasks. Tick a task done. (C2, C3)
7. **Blocker: one rejected and one accepted input.** Settings, "Focus blocker": type `not a site` and add it. The app says "This is not a valid website". Then add `news.com`: it appears in the list. Adding `news.com` again says "Already on your list". (C1, C4)
8. **Focus session with the blocker.** Open Focus, start a short session. In window 2, open a blocked site: Chrome shows the LockedIn block page. Say: "A website cannot block other sites, so the extension asks our server every 30 seconds whether a session is running." End the session and rate it. (C3)
9. **Analytics and PDF.** Open Analytics, show the focus score and goal progress, then export the PDF report. Known: hour-goal numbers can be cut off in the PDF (#135). (C2, C3)
10. **Coach (only if the demo account is Pro, or the coach is open to Free users).** Ask "Plan two study sessions for tomorrow afternoon". The coach answers with a draft; accept it, then show it in the calendar and undo it. Say: "Claude only proposes; the calendar changes only when the user accepts, and only after our checks pass." (C3, C5)
11. **Outlook (optional).** Settings, Outlook: show "Last synced …" and an imported event in the calendar. (C3)
12. **Close.** Say: "The code, the plan it was built from and about 295 test files are in the repository; we will show them now." (C6)

Do not demo an upgrade to Pro: paying on the live site currently shows an error (#121). If the team fixes it, Stripe runs in test mode only (`.env.example`).

## If something breaks

Stay calm, say what the app shows, and say why it is designed that way. These are the answers in the code today.

| Service | What the user sees | Where in the code | What to do |
|---|---|---|---|
| Supabase (database) | "Your data cannot be loaded right now." on a page; actions answer the same with status 503. Queries give up after 10 seconds. | `src/app/error.tsx`, `src/lib/server/errors.ts`, `src/lib/server/db/with-user.ts` | Wait 30 seconds and reload (a paused free database wakes up). If it stays down, go to the walkthrough and explain R1: nothing half-saved. |
| Supabase (sign-in) | "Signing in is not available right now. Try again later" | `src/lib/server/errors.ts` | Stay signed in from the evening before; do not sign out during the demo. |
| Claude (coach) | "The assistant is not available right now. Your calendar is unchanged". The typed text stays in the field. The call gives up after 60 seconds. | `src/lib/server/actions/send-message.ts`, `src/lib/server/claude/client.ts` | Skip the coach step. Say the calendar, chats and open drafts are unchanged. |
| Outlook | Imported events stay with "Last synced …"; app events not yet sent show "Not sent to Outlook". Each Microsoft call gives up after 10 seconds. | `src/lib/server/outlook/sync.ts`, `src/lib/server/outlook/graph.ts` | Skip the Outlook step; the calendar works without it. |
| Google routing | The editor shows "Travel time not available"; the event is saved anyway. Calls give up after 8 seconds (places after 5). | `src/lib/server/actions/travel-time.ts`, `src/lib/server/google/routes.ts` | Point out that the event is saved and only the extra is missing. |
| Stripe | "Payment is not available right now." The plan stays as it was. | `src/lib/server/actions/billing.ts`, `src/lib/server/stripe/client.ts` | We do not demo payment (#121). |
| Weather (Open-Meteo) | The widget says "Weather not available". Calls give up after 5 seconds. | `src/lib/server/actions/weather.ts`, `src/lib/server/weather/open-meteo.ts` | Ignore it and go on. |
| Extension | Settings shows the blocker as not connected; the app itself keeps working. | `src/components/settings/BlockerCard.tsx` | Reload the extension in `chrome://extensions`, or describe the block page instead. |
| Vercel itself | The site does not load at all. | (outside our code) | Show the last good deployment's URL from Vercel, or run `npm run dev` locally as a last resort and say so. Check before the demo that a local run with `.env.local` works. |
