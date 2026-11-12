# Team project: Ontology
Draft of 10 November 2026. On the branch `prototype-style` (a variant for the team to compare with `main`): display settings, R34 and the details of `update_settings` and `delete_account` added 12 Nov 2026 (spec 12).
A web app that brings calendar, goals and focused work together, and blocks distracting websites in Chrome.
Rule for coding agents: read this file first. Do not change it without the team's approval; propose the change and wait.

## Purpose and scope
- **Problem and user.** Anyone who wants to be more productive and is constantly distracted while planning across three or four tools: students, employees, self-employed people, in private life or at work. Example persona: a student in the exam phase (lectures, a statistics exam, half-marathon training).
- **User journey.** Sign up, set goals with weekly rules, note tasks, plan days, focus while sites are blocked, mark events done, see progress.
- **One role:** the signed-in user. No admin. Nothing is shared between users.
- **Two plans:** Free has everything except the AI chat; Pro adds it, paid through Stripe in test mode.

## 1 Concepts
| Concept | What it is | Fixed, Saved or Calculated |
|---|---|---|
| **user** (core) | The person with an account. | Saved |
| **goal** (core) | Something to reach by a deadline, with one or more rules and optional auto-block. | Saved |
| **rule** (core) | A weekly requirement of a goal: a number of events or of hours per week. | Saved |
| **event** (core) | A calendar block, timed or all-day. A timed event may have a goal and belong to a series. | Saved |
| **focus_session** (core) | Concentrated work with a timer, with or without an event. | Saved |
| **blocked_site** (core) | A website on the user's block list. | Saved |
| task | A to-do with an optional due date. It belongs to one goal or to none (then it is listed under "Inbox"). | Saved |
| blocked_attempt | A visit to a blocked site that the extension stopped. | Saved |
| chat_message | A message in the AI chat, from the user or the assistant. An assistant message may carry one draft. | Saved |
| draft_plan | The assistant's proposal of events within the next 14 days. Becomes events only when accepted. | Saved |
| calendar_connection | The link to the user's Outlook calendar, read and write. | Saved |
| settings | Side item: time zone and travel details. | Saved |
| plan | Free or Pro. Which one a user has is saved on the user. | Fixed |

**Fixed content:** session lengths 15, 30, 60, 90, 120 minutes; the two plans (Free, Pro); the default block list of a new account (youtube.com, instagram.com, tiktok.com, x.com, reddit.com, facebook.com), which the user can edit.

**Calculated, never saved:** rule status, goal progress, blocking on or off, focus score, travel time, analytics, R31's chat totals, task overdue.

## 2 Relationships
- Every saved row belongs to one user, who has one plan, one settings row, up to 50 blocked sites, at most one calendar connection, one open draft and one running or paused session.
- A goal has one or more rules. A timed event belongs to at most one goal. A focus session belongs to at most one event. Events of one series share a `series_id`.
- An assistant message carries at most one draft plan. An accepted draft plan creates events.
- A goal has any number of tasks. A task belongs to at most one goal. A user has at most 100 open tasks.

## 3 Data model
Times in UTC, shown in the user's time zone. Lengths in minutes. Every table has `id` (uuid) and, except user, `user_id`.

- **user**: `email` text, `status` `unconfirmed`/`confirmed` (kept by Supabase Auth), `plan` `free`/`pro`, `stripe_customer_id` text or empty, `chat_count_date` date and `chat_count` integer (3), `extension_seen_at` timestamp or empty
- **settings**: `time_zone` text, from the browser at sign-up, or "Europe/Lisbon" if it gives none or an invalid one, `home_address` text or empty, `travel_mode` `driving`/`cycling`/`walking` (default `driving`), `travel_buffer_minutes` integer 0 to 120 (10), `time_format` `12h`/`24h` (default `12h`), `day_start_hour` integer 0 to 23 (7) and `day_end_hour` integer 1 to 24 (21), the end after the start (the calendar's visible hours)
- **goal**: `title` text 1 to 80 characters, `deadline` date ("2027-03-14"), `auto_block` boolean (false), `created_at`, `updated_at` timestamps
- **rule**: `goal_id` → goal, `kind` `count`/`hours`, `target` decimal (2), `min_minutes` integer or empty, only for `count` (45)
- **task**: `title` text 1 to 100 characters, `goal_id` → goal or empty, `due_date` date or empty ("2026-11-20"), `status` `open`/`done`, `done_at` timestamp (empty while open), `created_at`, `updated_at`
- **event**: `title` text 1 to 100 characters, `all_day` boolean (false), `start_at`, `end_at` timestamps, empty if all-day ("2026-11-16 09:00", "11:00"), `first_day`, `last_day` dates, only if all-day, `goal_id` → goal or empty, `location` text or empty, `may_overlap` boolean (false), `status` `planned`/`done`, `source` `app`/`assistant`/`outlook`, `series_id` uuid or empty, `outlook_id` text or empty, `updated_at`
- **focus_session**: `event_id` → event or empty, `planned_minutes` integer (60), `status` `running`/`paused`/`finished`, `started_at`, `paused_at` (empty while running), `paused_seconds` integer (600), `ended_at` (empty until finished), `rating` integer 0 to 5 or empty (4)
- **blocked_site**: `domain` text ("instagram.com")
- **blocked_attempt**: `domain` text, `attempted_at` timestamp ("2026-11-16 10:15")
- **chat_message**: `role` `user`/`assistant`, `text` up to 4,000 characters, `created_at` timestamp
- **draft_plan**: `message_id` → chat_message, `proposed_events` list of (title, start_at, end_at, goal_id), `status` `open`/`accepted`/`rejected`/`replaced`
- **calendar_connection**: `status` `connected`/`needs_reconnect`, `token_encrypted` text, `last_synced_at` timestamp
- Calculated: rule status `open`/`met`/`missed`, `focused_minutes`, `focus_score`, `blocking_on`, `blocking_until`, `leave_at`.

## 4 Statuses
- **user `status`**: starts `unconfirmed` (`sign_up`). → `confirmed` (`confirm_email`).
- **event**: starts `planned`. `planned` → `done` (`mark_event_done`) → `planned` (`mark_event_planned`). All-day events stay `planned`.
- **task**: starts `open` (`add_task`). `open` → `done` (`complete_task`) → `open` (`reopen_task`). A done task is deleted by itself 7 days after it was done (R33).
- **focus_session**: starts `running` (`start_session`). `running` ⇄ `paused` (`pause_session`, `resume_session`). `running` or `paused` → `finished` (`end_session`, or by itself, R13). `cancel_session`, or less than one focused minute, deletes the row.
- **draft_plan**: starts `open` (`send_message` with a draft answer). `open` → `accepted` (`accept_draft`), `rejected` (`reject_draft`) or `replaced` (the next draft answer). `clear_chat` deletes it.
- **calendar_connection**: starts `connected` (`connect_outlook`). → `needs_reconnect` when Microsoft refuses the stored access → `connected` (`connect_outlook`). `disconnect_outlook` deletes it.
- **user `plan`**: starts `free`. → `pro` when Stripe confirms payment → `free` when Stripe confirms the subscription ended.
- **rule status** (calculated per week): `open` → `met` or `missed` (R8).

## 5 Actions
The first six actions need no sign-in; all others need it and touch only the user's own rows (R3). Rejected actions change nothing (R1).

| Action | Input | Allowed when | If accepted | If rejected (message) |
|---|---|---|---|---|
| `sign_up` | email, password | Email new; password ≥ 8 characters | Account `unconfirmed` with default settings and block list, nothing else; plan `free`; confirmation link sent | "This email is already registered" / "Password needs at least 8 characters" |
| `confirm_email` | link | Link valid and unused | `confirmed` | "This link has expired. Ask for a new one" |
| `resend_confirmation` | email | 60 seconds since the last link | Shows "If this email needs confirming, we sent a link"; sends only to an unconfirmed account | "Please wait a minute before asking again" |
| `sign_in` | email, password | They match; account `confirmed` | Signed in | "Email or password is wrong" / "Confirm your email first. We sent you a link" |
| `request_password_reset` | email | always | Shows "If this email is registered, we sent a link"; sends only to a registered email | none |
| `reset_password` | link, new password | Link valid and unused; password ≥ 8 characters | New password saved | "This link has expired. Ask for a new one" / "Password needs at least 8 characters" |
| `update_settings` | settings | Buffer whole 0 to 120; time zone known; home address up to 200 characters or empty; visible hours as section 3 | Saved | "Buffer must be 0 to 120 minutes" / "Choose a time zone from the list" / "Home address can be at most 200 characters" / "Visible hours must be whole hours, from 0 to 24, ending after they start" |
| `delete_account` | confirmation (the word "DELETE" typed) | Plan `free`; "DELETE" typed | All the user's rows and the sign-in account deleted; signed out | "Cancel Pro before deleting your account" / "Type DELETE to confirm" |
| `create_goal`, `edit_goal` | title, deadline, auto_block, rules | Title 1 to 80; deadline not past when set or changed; at least one rule (R7) | Goal and rules saved together | "Title must be 1 to 80 characters" / "Add at least one rule" / "The deadline cannot be in the past" / "Target must be 1 to 14 events" / "Target must be 0.5 to 60 hours" / "Minimum length must be 15 to 240 minutes" |
| `add_task`, `edit_task` | title, goal or none, due date or none | Title 1 to 100; due date not past when set or changed; `add_task`: under 100 open tasks (R32) | Saved (`add_task`: `open`) | "Title must be 1 to 100 characters" / "The due date cannot be in the past" / "You can have at most 100 open tasks" |
| `complete_task`, `reopen_task` | task | Complete: `open`. Reopen: `done`; under 100 open tasks | `done` / `open` | "Not possible in this state" / "You can have at most 100 open tasks" |
| `remove_rule` | rule | Goal keeps one rule | Rule deleted | "A goal needs at least one rule" |
| `create_event` | title; start and end, or first and last day (`all_day`); goal, location, may_overlap; repeat, weekdays, repeat_until | Title 1 to 100; timed: start before end, at most 24 h; R28, R29 | Saved, `source` `app` (a series in one step); sent to Outlook if connected | "Title must be 1 to 100 characters" / "End must be after start" / "An event can last at most 24 hours" / "The last day cannot be before the first day" / "An all-day event can last at most 31 days" / "All-day events have no goal" / "A repeating event can have at most 100 dates" / "The end date cannot be before the first date" |
| `edit_event`, `delete_event` | event, updated_at, scope `this`/`this_and_following` | Edit: same checks as `create_event`; Outlook events: goal only (R11); not changed elsewhere (R4) | Saved or deleted (scope as R28), also in Outlook | As `create_event` / "Change this event in Outlook" / "Changed on another device. Reload to see the latest version" |
| `mark_event_done` | event | `planned`; timed; event has started | `done` (`mark_event_planned` turns it back) | "You can mark an event done once it has started" / "All-day events cannot be marked done" |
| `start_session` | length, event or none | No running or paused session; length as R12 | `running` | "A session is already running" / "Choose 15, 30, 60, 90 or 120 minutes" |
| `pause_session`, `resume_session`, `end_session`, `cancel_session` | session | Pause: `running`; resume: `paused`; end, cancel: either | `paused` / `running` / `finished` / row deleted | "Not possible in this state" / "This session has already ended" |
| `rate_session` | session, rating | `finished`; whole number 0 to 5 | Rating saved; can be changed | "Rating must be a whole number from 0 to 5" |
| `add_blocked_site` | domain | Valid domain (R17); not listed; under 50 sites | Saved | "This is not a valid website" / "Already on your list" / "You can block at most 50 sites" |
| `send_message` | text (typed or spoken) | Pro; under limit (R21); text 1 to 4,000 characters | User message and checked answer (R23) saved; a draft answer becomes `open`, an older open draft `replaced` | "The AI chat is part of Pro" / "Today's 20 messages are used" / "The assistant's answer failed our checks. Please try again" / "The assistant is not available right now. Your calendar is unchanged" |
| `accept_draft` | draft | Draft `open`; Pro; no proposed event has started | Events created in one step, `source` `assistant`; draft `accepted` | "This draft is no longer open" / "This draft is out of date. Ask again" |
| `reject_draft` | draft | Draft `open` | Draft `rejected` | "This draft is no longer open" |
| `connect_outlook` | Microsoft sign-in | User grants read and write access at Microsoft | Connection saved; import runs; app events are written (R26) | "Outlook was not connected" |
| `upgrade_to_pro`, `cancel_pro` | none | Plan `free` / `pro` | Stripe test checkout opens (plan changes as R25) / subscription ends after the paid period | "You already have Pro" / "You do not have Pro" |

**Always allowed:** `sign_out`; `delete_goal` (its rules are deleted; its events and tasks stay, without goal); `delete_task`; `remove_blocked_site` (past attempts stay); `clear_chat` (all messages and drafts are deleted; events stay); `disconnect_outlook` (R26).

**By itself:** `sync_outlook` when the calendar opens, at most every 5 minutes, 7 days back to 60 ahead, also sending unsent app events. `finish_session` (R13). `record_attempt` for each stopped page on the list. `update_plan` (R25). `remove_done_tasks` (R33).

## 6 Rules
**General**
- **R1** A rejected action changes nothing. An accepted action is saved at once, several rows together in one step (`create_goal`, `accept_draft`, a series). The server checks every input. Exception: a failed `send_message` (checks, or Claude down) saves nothing, not even the user message, but counts towards R21.
- **R2** A week always runs Monday 00:00 to Sunday 24:00 in the user's time zone. A timed event belongs to the day and week it starts in; an all-day event to each day from its first to its last day.

**Access and devices**
- **R3** The database returns and changes only the signed-in user's rows (row-level security). User A asking for user B's event gets "Not found"; A's edit or delete of B's row is rejected. Without sign-in, any data request gets the sign-in page or "401" and no data.
- **R4** Two devices of one account share one database. An edit or delete carrying an older `updated_at` than the row is rejected. The database allows one running or paused session per user and accepts a draft only once.
- **R5** Permissions are checked where the action happens, not only on the screen: a Free user calling the chat address directly is rejected.
- **R6** Only the server sets `user.plan`, never the user, not even through the database.

**Goals and rules**
- **R7** `count`: 1 to 14 events per week, optional `min_minutes` 15 to 240. `hours`: 0.5 to 60 hours per week, in steps of 0.5.
- **R8** Only `done` events of the goal count, for every rule of that goal. With `min_minutes`, only events at least that long count. `hours` adds the lengths. A week is `met` when the target is reached, `missed` when it ended unmet, otherwise `open`. The week the goal was created is never `missed`.
- **R9** Goal progress: per rule "This week: 1 of 2 done" or "3.5 of 6 h"; a strip of weeks from creation to deadline (`met` if all rules are met, `missed` if any is missed, else `open`); a countdown ("12 days left", "Deadline passed"). Weeks after the deadline are not judged. Editing a rule changes past weeks too (accepted limit).

**Events**
- **R10** Overlap is never a reason to reject; both are saved. If either has `may_overlap` = false, both get a conflict mark and the user decides. Ending exactly when the next starts is no overlap.
- **R11** Outlook events keep title, times and location from Outlook; the user can only set the goal and mark them done.

**Focus sessions**
- **R12** Lengths are exactly 15, 30, 60, 90 or 120 minutes.
- **R13** `focused_minutes` = `ended_at` − `started_at` − `paused_seconds`, rounded down to whole minutes. A running session finishes by itself at the planned length, even with the browser closed: the server sets `ended_at` = `started_at` + planned minutes + `paused_seconds`. A paused session stays paused until the user resumes or ends it.
- **R14** Under one focused minute, or cancelled: not saved. Rating is optional; empty is not 0; 0 is a real rating.

**Blocking and the extension**
- **R15** Blocking is on when (a) a session is `running` (not paused), or (b) now is within a timed event (start ≤ now < end) whose goal has `auto_block` on. `blocking_until` is the latest of these ends. Tabs already open on a blocked site also go to the block page (not an attempt), which shows when blocking ends.
- **R16** The extension asks the app every minute and receives only the block list, `blocking_on` and `blocking_until`. It reports blocked attempts, holds no keys and uses the app's sign-in in the same Chrome browser; signed out, nothing is blocked. If it cannot reach the app, it keeps the last answer until `blocking_until`, then stops; attempts are sent later.
- **R17** Domains are cleaned before saving ("https://www.Instagram.com/reels" becomes "instagram.com"). No duplicates; at most 50.
- **R18** Limits: only page loads in Chrome on that computer are blocked; not phone apps or other programs, and no screen time. Blocking can start up to one minute late. The blocker is a help, not a lock: the user can end a session, switch off auto-block or edit the list any time; ending early lowers the score. If the extension has not asked for 2 minutes, the app shows "Blocker not connected: nothing is being blocked". Sessions still work.

**Focus score and analytics**
- **R19** Our definition, per finished session: 100 × focused minutes ÷ planned minutes, rounded, minus 5 per blocked attempt during the session, kept between 0 and 100. A day or week shows the average of its sessions; no sessions shows "–", not 0. The 7 Nov idea needed screen-time data a website cannot read.
- **R20** Analytics, per day and week: focused minutes, finished sessions, focus score, blocked attempts, most blocked sites.

**AI chat**
- **R21** Pro only. At most 20 messages (`send_message`) per user per calendar day in the user's time zone, counted in the database. The provider account has a spending limit.
- **R22** Sent to Claude with every message: the last 10 messages, goals with deadlines and rules, events from today to 14 days ahead (title, start, end, `may_overlap`, `all_day`), R31's totals, the time zone. Not sent: email, password, locations, block list, payment data, tasks. The chat page says what is sent.
- **R23** An answer is a text (changes nothing) or a draft. Every proposed event must be timed, start between now and the end of the 14th day from today (on 16 Nov: until 30 Nov 24:00), start before it ends, last 15 minutes to 8 hours, not overlap another proposal or a timed event with `may_overlap` = false, and use only the user's goals; at most 30. One failed check rejects the whole answer (R1).
- **R24** Voice: the browser's own speech recognition (English, Chrome) fills the editable input field. Our server receives text only.

**Payment, Outlook, travel**
- **R25** Stripe test mode only: if the secret key does not start with `sk_test_`, the server rejects it, payment stays off and the error is logged. The plan changes only on Stripe's signed message to our server, never from the browser's return page.
- **R26** Connecting asks for read and write access at once; declined means not connected. Then every event with `source` `app` or `assistant` that has not ended goes to Outlook, in batches, with later edits and deletions. If Outlook is down or refuses for now (too many requests), the event is marked "Not sent to Outlook" (empty `outlook_id`) and sent at the next sync. Events deleted in Outlook vanish at the next sync; its repeating events arrive as single events. Disconnecting deletes imported events from the app; what the app wrote stays in Outlook.
- **R27** Travel time needs a timed event with a location that is not a web link and a home address (else "Add your home address in settings"). OpenStreetMap routing for the chosen mode; "© OpenStreetMap contributors" is shown. `leave_at` = start − travel minutes − buffer. The app may reuse a result for up to 6 hours; it is never stored with the event. Address not found: "Address not found", event unchanged.

**Repeating and all-day events**
- **R28** Timed events can repeat `daily`, `weekly` (chosen weekdays, always including the first date's) or `monthly` (same day of the month; months without it are skipped) until `repeat_until`, which is on or after the first date. At most 100 dates. All are created at once as normal events with one `series_id` and the same title, time, length, goal, location and `may_overlap`; each has its own status and goes to Outlook singly. Our decision: no repeat rule is stored; to extend a series, create a new one. Scope `this_and_following` changes or deletes this event and the later ones of its series; edits keep their dates.
- **R29** An all-day event has a first and last day (at most 31 days), no times, and shows at the top of its days. It has no goal, never counts for rules, cannot be done, gets no conflict mark, no blocking, no travel time and no repeat. It syncs with Outlook like other events. The AI chat sees it but never proposes one.

**Accounts**
- **R30** Supabase Auth sends confirmation and reset links; only `confirmed` users can sign in. The neutral answers of `resend_confirmation` and `request_password_reset` stop anyone testing which emails have accounts. Limit: Supabase's built-in sender allows 2 e-mails per hour for the whole project (section 9).

**AI chat: questions about the past**
- **R31** For every message the server, not Claude, adds up the current week and the 7 before: per week and goal, minutes of `done` timed events and focused minutes of finished sessions (a session counts for its event's goal, else "no goal"); for `done` events without a goal, minutes per title, only the 20 titles with the most minutes. Limit: the assistant sees only these totals, no single past events, nothing older than 8 weeks.

**Display**
- **R34** Times are shown as the user's `time_format` says: 12-hour by default ("9am", "1:30pm", a range "9 – 10:30am", an end with its length "1:30pm · 1h"), or 24-hour ("9:00", "13:30"). Dates are month-first ("Nov 16", "Mon, Nov 16", "Monday, November 16"). The calendar shows the hours from `day_start_hour` to `day_end_hour`, widened when an event starts outside them. Only the screen changes: stored values, the values of form fields and server messages keep their form.

**Tasks**
- **R32** A task belongs to one of the user's goals or to none; tasks without a goal are listed under "Inbox". At most 100 open tasks per user. A task never counts for a rule and never appears in the calendar.
- **R33** Under each goal the open tasks come first, by due date (earliest first, tasks without a date last), then the done tasks, struck through. A due date before today (in the user's time zone) is marked overdue. A done task is deleted by itself 7 days after it was done.

## 7 What is saved, where, and who can see it
- **Email, password:** Supabase Auth, the password only as a hash (it cannot be turned back into the password).
- **All rows of section 3:** Supabase (Postgres) with row-level security. Seen only by the owner.
- **Outlook access:** encrypted in `calendar_connection`, read only by our server; never in the browser or extension.
- **Card details:** Stripe only; we keep `stripe_customer_id` and `plan`.
- **AI chat:** messages and drafts saved; R22's data goes to the provider of Claude.
- **Tasks:** saved in the database, visible only to their user (R3).
- **Extension:** Chrome's storage holds the block list and blocking state, on that computer only.

**Secrets:** Claude API key, Supabase service key and connection string, Microsoft client secret, the key that encrypts the Outlook access, the routing service key, Stripe secret and webhook keys, the e-mail sender's password. Only on the server as environment variables, never in the public repository, the browser or the extension. After a leak: revoke the key, create a new one, check the provider's usage.

**When a service is down** (no crash; calls give up after 10 seconds):

| Service | The user sees | Unchanged |
|---|---|---|
| Database | "Your data cannot be loaded right now." (Free database woken before the demo.) | Nothing saved in the browser |
| Claude | "The assistant is not available right now. Your calendar is unchanged." | Calendar, chat, open draft |
| Outlook | Imported events with "Last synced 8:40am"; app events marked "Not sent to Outlook" | App events |
| Routing | "Travel time not available" | The event |
| Stripe | "Payment is not available right now." | Plan |
| E-mail | "We could not send the email. Try again later" | Account stays `unconfirmed` |

## 8 Acceptance scenarios
| ID | Start | Action | Expected |
|---|---|---|---|
| A1 | Goal created last week; rule `count` 2 per week, `min_minutes` 45 | Runs of 50 and 40 minutes marked done; week ends | "1 of 2 done"; week `missed` |
| A2 | 60-minute session from 09:00, paused 09:20 to 09:30, 2 blocked attempts | `end_session` at 09:55 | Focused 45; score 75 − 10 = 65 |
| A3 | Goal with `auto_block` on; event 09:00 to 11:00; no session | Extension asks at 10:15; user opens instagram.com | Blocked until 11:00; attempt (instagram.com, 10:15) saved; off at 11:00 |
| A4 | Free user | Calls `send_message` directly | "The AI chat is part of Pro"; Claude not called; nothing saved |
| A5 | Pro, Mon 16 Nov; fake answer for Tue 17 Nov: study 08:00–13:00, call 13:30–14:00, sport 18:00–19:30, event 20:00–22:30 | `send_message` "Tomorrow I want to study from 8 to 1, a short call at 13:30, sport in the evening and an event at night"; then `accept_draft` | Both messages saved; `open` draft, 4 proposals, calendar unchanged; after accepting, 4 events, `source` `assistant` |
| A6 | Pro, 19 messages today; Claude proposes 13:30 to 13:00 | `send_message` twice | First: "The assistant's answer failed our checks. Please try again", no message saved, count 20. Second: "Today's 20 messages are used", Claude not called |
| A7 | Same account on laptop and desktop | Laptop moves "Statistics revision" to 10:00; desktop, on the old version, saves a new title | Both show the same events; desktop save rejected ("Changed on another device…"); event at 10:00, old title |
| A8 | User A; event E of user B | A requests E, then deletes E | "Not found"; delete rejected; E unchanged |
| A9 | Event 10:00 at "Nova SBE, Carcavelos"; home set; route 25 min; buffer 10 | Open event; then routing goes down | "Leave at 09:25"; then "Travel time not available", event unchanged |
| A10 | Any user | `start_session` with 25 minutes; `create_event` from 14:00 to 13:00; `add_blocked_site` with "not a site" | "Choose 15, 30, 60, 90 or 120 minutes" / "End must be after start" / "This is not a valid website"; nothing saved |
| A11 | Pro; fake totals: "Half marathon" 150 minutes last week, 100 the week before | `send_message` "How much time did I spend on sport in the last weeks?" | Answer names 150 and 100 minutes; no draft; nothing changed; Claude received totals only |
| A12 | No events | Weekly Tue and Thu 09:00–10:00, first date Tue 17 Nov 2026, until 18 Dec; then `delete_event` `this_and_following` on Tue 8 Dec; then daily with 101 dates | 10 events, one `series_id`; 6 remain (17, 19, 24, 26 Nov, 1, 3 Dec); daily: "A repeating event can have at most 100 dates", nothing saved |
| A13 | All-day "Exam week" Mon 16 to Fri 20 Nov; Tue 09:00–11:00 event of an `auto_block` goal; no session | Extension asks Tue 10:00 and Wed 10:00 | No conflict mark; Tue: blocked until 11:00; Wed: not blocked |
| A14 | Account `unconfirmed`; no account for "x@example.com" | `sign_in`; `request_password_reset` for "x@example.com" | "Confirm your email first. We sent you a link"; "If this email is registered, we sent a link", no email sent |
| A15 | Goal "Half marathon" exists; no tasks | `add_task` "Buy running shoes" for that goal, due 20 Nov; then `complete_task` | Listed under the goal, count 1; after completing: struck through, count 0 |
| A16 | 100 open tasks | `add_task` | "You can have at most 100 open tasks"; nothing saved |
| A17 | A goal with two tasks | `delete_goal` | Both tasks are listed under "Inbox" |

## 9 Open decisions
Each with its default.
- Public transport for travel time? Not offered.
- Price of Pro? €5 per month, test mode, no trial.
- E-mail sender: built-in or our own? Our own sender before step 1 is deployed; its password is a secret.
- Does finishing a session mark its event done? No, the user marks it.

## 10 Out of scope
Booking-page integrations; chat-tool status; calendar subscription links (ICS); coach recommendations, an evening check-in and a weekly review (our prototype had them); admin accounts, sharing, social features; a native phone app; calendars other than Outlook; other sign-in methods; habit, sport and cycle tracking; dark mode; games; screen-time measurement; travel stopovers; sub-tasks; repeating tasks; putting a task into the calendar; to-dos and notes inside an event.

## Where this comes from
Team meeting of 7 Nov 2026; our decisions of 10 Nov; the teaching staff's answers; the course wiki.
Lessons from our first prototype: its data lived in one browser; we found its goal chart hard to read; it had other session lengths and a 1 to 5 rating.
