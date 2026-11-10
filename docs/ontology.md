# Team project: Ontology
Draft of 10 November 2026.
A web app that brings calendar, goals and focused work together, and blocks distracting websites in Chrome.
Rule for coding agents: read this file first. Do not change it without the team's approval; propose the change and wait.

## Purpose and scope
- **Problem.** Students are constantly distracted and plan their week across three or four tools.
- **Example user.** A student in the exam phase: lectures, a statistics exam in January, training for a half marathon.
- **User journey.** Sign up, create goals with weekly rules, plan days, work in focus sessions while sites are blocked, mark events done, see progress.
- **One role:** the signed-in user. No admin. Nothing is shared between users.
- **Two plans:** Free has everything except the AI planner; Pro adds it, paid through Stripe in test mode.

## 1 Concepts
| Concept | What it is | Fixed, Saved or Calculated |
|---|---|---|
| **user** (core) | The person with an account. | Saved |
| **goal** (core) | Something to reach by a deadline, with one or more rules and optional auto-block. | Saved |
| **rule** (core) | A weekly requirement of a goal: a number of events or of hours per week. | Saved |
| **event** (core) | A time block in the calendar, optionally with one goal and a location. | Saved |
| **focus_session** (core) | Concentrated work with a timer, with or without an event. | Saved |
| **blocked_site** (core) | A website on the user's block list. | Saved |
| blocked_attempt | A visit to a blocked site that the extension stopped. | Saved |
| draft_plan | The AI planner's proposal for one day. Becomes events only when accepted. | Saved |
| calendar_connection | The link to the user's Outlook calendar. | Saved |
| settings | Side item: time zone and travel details. | Saved |
| plan | Free or Pro. Which one a user has is saved on the user. | Fixed |

**Fixed content:** session lengths 15, 30, 60, 90, 120 minutes; the two plans (Free, Pro); the default block list of a new account (youtube.com, instagram.com, tiktok.com, x.com, reddit.com, facebook.com), which the user can edit.

**Calculated, never saved:** rule status, goal progress, blocking on or off, focus score, travel time, analytics.

## 2 Relationships
- Every saved row belongs to exactly one user. A user has one plan, one settings row, up to 50 blocked sites, at most one calendar connection, one open draft and one running or paused session.
- A goal has one or more rules. An event belongs to at most one goal. A focus session belongs to at most one event.
- An accepted draft plan creates events.

## 3 Data model
Times in UTC, shown in the user's time zone. Lengths in minutes. Every table has `id` (uuid) and, except user, `user_id`.

- **user**: `email` text, `plan` `free`/`pro`, `stripe_customer_id` text or empty, `planner_count_date` date and `planner_count` integer (3), `extension_seen_at` timestamp or empty
- **settings**: `time_zone` text, from the browser at sign-up ("Europe/Lisbon"), `home_address` text or empty, `travel_mode` `driving`/`cycling`/`walking` (default `driving`), `travel_buffer_minutes` integer 0 to 120 (10)
- **goal**: `title` text 1 to 80 characters, `deadline` date ("2027-03-14"), `auto_block` boolean (false), `created_at`, `updated_at` timestamps
- **rule**: `goal_id` → goal, `kind` `count`/`hours`, `target` decimal (2), `min_minutes` integer or empty, only for `count` (45)
- **event**: `title` text 1 to 100 characters ("Statistics revision"), `start_at`, `end_at` timestamps ("2026-11-16 09:00", "11:00"), `goal_id` → goal or empty, `location` text or empty ("Nova SBE, Carcavelos"), `may_overlap` boolean (false), `status` `planned`/`done`, `source` `app`/`planner`/`outlook`, `outlook_id` text or empty, `updated_at`
- **focus_session**: `event_id` → event or empty, `planned_minutes` integer (60), `status` `running`/`paused`/`finished`, `started_at`, `paused_at` (empty while running), `paused_seconds` integer (600), `ended_at` (empty until finished), `rating` integer 0 to 5 or empty (4)
- **blocked_site**: `domain` text ("instagram.com")
- **blocked_attempt**: `domain` text, `attempted_at` timestamp ("2026-11-16 10:15")
- **draft_plan**: `day` date ("2026-11-17"), `request_text` text up to 4,000 characters, `change_text` text or empty, `proposed_events` list of (title, start_at, end_at, goal_id), `status` `open`/`accepted`/`rejected`/`replaced`
- **calendar_connection**: `status` `connected`/`needs_reconnect`, `write_to_outlook` boolean (false), `token_encrypted` text, `last_synced_at` timestamp
- Calculated: rule status `open`/`met`/`missed`, `focused_minutes`, `focus_score`, `blocking_on`, `blocking_until`, `leave_at`.

## 4 Statuses
- **event**: starts `planned`. `planned` → `done` (`mark_event_done`) → `planned` (`mark_event_planned`).
- **focus_session**: starts `running` (`start_session`). `running` ⇄ `paused` (`pause_session`, `resume_session`). `running` or `paused` → `finished` (`end_session`, or by itself, R13). `cancel_session`, or less than one focused minute, deletes the row.
- **draft_plan**: starts `open` (`request_plan`). `open` → `accepted` (`accept_draft`), `rejected` (`reject_draft`) or `replaced` (`revise_draft` or a new `request_plan`).
- **calendar_connection**: starts `connected` (`connect_outlook`). → `needs_reconnect` when Microsoft refuses the stored access → `connected` (`connect_outlook`). `disconnect_outlook` deletes it.
- **user `plan`**: starts `free`. → `pro` when Stripe confirms payment → `free` when Stripe confirms the subscription ended.
- **rule status** (calculated per week): `open` → `met` or `missed` (R8).

## 5 Actions
All actions except `sign_up` and `sign_in` need sign-in and touch only the user's own rows (R3). Rejected actions change nothing (R1).

| Action | Input | Allowed when | If accepted | If rejected (message) |
|---|---|---|---|---|
| `sign_up` | email, password | Email new; password ≥ 8 characters | Account with default settings and block list, nothing else; plan `free` | "This email is already registered" / "Password needs at least 8 characters" |
| `sign_in` | email, password | They match | Signed in | "Email or password is wrong" |
| `update_settings` | settings | Buffer whole 0 to 120 | Saved | "Buffer must be 0 to 120 minutes" |
| `delete_account` | confirmation | Plan `free` | All the user's rows deleted | "Cancel Pro before deleting your account" |
| `create_goal`, `edit_goal` | title, deadline, auto_block, rules | Title 1 to 80; deadline not past when set or changed; at least one rule (R7) | Goal and rules saved together | "Title must be 1 to 80 characters" / "Add at least one rule" / "The deadline cannot be in the past" / "Target must be 1 to 14 events" / "Target must be 0.5 to 60 hours" / "Minimum length must be 15 to 240 minutes" |
| `remove_rule` | rule | Goal keeps one rule | Rule deleted | "A goal needs at least one rule" |
| `create_event` | title, start, end, goal, location, may_overlap | Title 1 to 100; start before end; at most 24 h | Saved, `source` `app`; written to Outlook if switched on | "Title must be 1 to 100 characters" / "End must be after start" / "An event can last at most 24 hours" |
| `edit_event`, `delete_event` | event, updated_at | Edit: same checks as `create_event`; Outlook events: goal only (R11); not changed elsewhere (R4) | Saved or deleted, also in Outlook | As `create_event` / "Change this event in Outlook" / "Changed on another device. Reload to see the latest version" |
| `mark_event_done` | event | `planned`; event has started | `done` (`mark_event_planned` turns it back) | "You can mark an event done once it has started" |
| `start_session` | length, event or none | No running or paused session; length as R12 | `running` | "A session is already running" / "Choose 15, 30, 60, 90 or 120 minutes" |
| `pause_session`, `resume_session` | session | `running` / `paused` | `paused` / `running` | "Not possible in this state" |
| `end_session`, `cancel_session` | session | `running` or `paused` | `finished` / row deleted | "This session has already ended" |
| `rate_session` | session, rating | `finished`; whole number 0 to 5 | Rating saved; can be changed | "Rating must be a whole number from 0 to 5" |
| `add_blocked_site` | domain | Valid domain (R17); not listed; under 50 sites | Saved | "This is not a valid website" / "Already on your list" / "You can block at most 50 sites" |
| `request_plan` | day, text | Pro; under limit (R21); text 1 to 4,000 characters; day not past | Checked answer (R23) saved as `open` draft (preview) | "The AI planner is part of Pro" / "Today's 20 planner requests are used" / "The planner's answer failed our checks. Please try again" / "The planner is not available right now. Your calendar is unchanged" |
| `revise_draft` | draft, change text | Draft `open`; as `request_plan` | New `open` draft; old one `replaced` | As above / "This draft is no longer open" |
| `accept_draft` | draft | Draft `open`; Pro; day not past | Proposed events created in one step, `source` `planner`; draft `accepted` | "This draft is no longer open" / "This draft is for a day that has passed" |
| `reject_draft` | draft | Draft `open` | Draft `rejected` | "This draft is no longer open" |
| `connect_outlook` | Microsoft sign-in | User grants read access at Microsoft | Connection saved; import runs | "Outlook was not connected" |
| `set_write_to_outlook` | on/off | Connected; "on" needs write access at Microsoft | Switch saved | "Outlook did not allow writing" |
| `upgrade_to_pro` | none | Plan `free` | Stripe test checkout opens; plan changes as R25 | "You already have Pro" |
| `cancel_pro` | none | Plan `pro` | Subscription ends after the paid period | "You do not have Pro" |

**Always allowed:** `sign_out`; `delete_goal` (its rules are deleted; its events stay, without goal); `remove_blocked_site` (past attempts stay); `disconnect_outlook` (imported events are deleted).

**What the app does by itself:** `sync_outlook` when the calendar opens, at most every 5 minutes, 7 days back to 60 ahead. `finish_session` (R13). `record_attempt` for each stopped page on the list. `update_plan` (R25).

## 6 Rules
**General**
- **R1** A rejected action changes nothing. An accepted action is saved at once, several rows together in one step (`create_goal`, `accept_draft`). The server checks every input.
- **R2** A week always runs Monday 00:00 to Sunday 24:00 in the user's time zone. An event belongs to the day and week it starts in.

**Access and devices**
- **R3** The database returns and changes only the signed-in user's rows (row-level security). User A asking for user B's event gets "Not found"; A's edit or delete of B's row is rejected and changes nothing. Without sign-in, any data request gets the sign-in page or "401" and no data.
- **R4** Two devices of one account read the same database. A save carrying an older `updated_at` than the row is rejected. The database allows one running or paused session per user and accepts a draft only once.
- **R5** Permissions are checked where the action happens, not only on the screen: a Free user calling the planner address directly is rejected.
- **R6** Only the server sets `user.plan`, never the user, not even through the database.

**Goals and rules**
- **R7** `count`: 1 to 14 events per week, optional `min_minutes` 15 to 240. `hours`: 0.5 to 60 hours per week, in steps of 0.5.
- **R8** Only `done` events of the goal count, for every rule of that goal. With `min_minutes`, only events at least that long count. `hours` adds the lengths. A week is `met` when the target is reached, `missed` when it ended unmet, otherwise `open`. The week the goal was created is never `missed`.
- **R9** Goal progress: per rule "This week: 1 of 2 done" or "3.5 of 6 h"; a strip of weeks from creation to deadline (`met` if all rules are met, `missed` if any is missed, else `open`); a countdown ("12 days left", "Deadline passed"). Weeks after the deadline are not judged. Editing a rule also changes past weeks; we accept this.

**Events**
- **R10** Overlap is never a reason to reject. Both events are saved side by side. If either has `may_overlap` = false, both get a conflict mark and the user decides. Ending exactly when the next starts is no overlap.
- **R11** Outlook events keep title, times and location from Outlook; the user can only set the goal and mark them done.

**Focus sessions**
- **R12** Lengths are exactly 15, 30, 60, 90 or 120 minutes.
- **R13** `focused_minutes` = `ended_at` − `started_at` − `paused_seconds`, rounded down to whole minutes. A running session finishes by itself at the planned length, even with the browser closed: the server works it out from the saved times, `ended_at` = `started_at` + planned minutes + `paused_seconds`. A paused session stays paused until the user resumes or ends it.
- **R14** Under one focused minute, or cancelled: not saved. Rating is optional; empty is not 0; 0 is a real rating.

**Blocking and the extension**
- **R15** Blocking is on when (a) a session is `running` (not paused), or (b) now is within an event (start ≤ now < end) whose goal has `auto_block` on. `blocking_until` is the latest of these ends. When blocking switches on, tabs already open on a blocked site go to the block page too; this is not an attempt. The block page shows when blocking ends.
- **R16** The extension asks the app every minute and receives only the block list, `blocking_on` and `blocking_until`. It reports blocked attempts, holds no keys and uses the app's sign-in in the same Chrome browser; signed out, nothing is blocked. If it cannot reach the app, it keeps the last answer until `blocking_until`, then stops blocking; attempts are sent when the app is reachable again.
- **R17** Domains are cleaned before saving ("https://www.Instagram.com/reels" becomes "instagram.com"). No duplicates; at most 50.
- **R18** Limits: only page loads in Chrome on that computer are blocked; not phone apps or other programs, and no screen time. Blocking can start up to one minute late. The blocker is a help, not a lock: the user can pause or end the session, switch off auto-block or edit the block list at any time; ending early lowers the focus score. If the extension has not asked for 2 minutes, the app shows "Blocker not connected: nothing is being blocked". Sessions still work.

**Focus score and analytics**
- **R19** Our definition: per finished session, 100 × focused minutes ÷ planned minutes, rounded, minus 5 per blocked attempt during the session, kept between 0 and 100. A day or week shows the average of its sessions; no sessions shows "–", not 0. The 7 Nov idea, share of productive time, needs screen-time data a website cannot read.
- **R20** Analytics, per day and week: focused minutes, finished sessions, focus score, blocked attempts, most blocked sites.

**AI planner**
- **R21** Pro only. At most 20 requests (`request_plan`, `revise_draft`) per user per calendar day in the user's time zone, counted in the database; failed checks count too. The provider account has a spending limit.
- **R22** Sent to Claude: the text, that day's events (title, start, end, `may_overlap`), the user's goals with deadlines and rules, the time zone. Not sent: email, password, other days, locations, block list, sessions, payment data. The planner page says what is sent.
- **R23** Before showing a draft, every proposed event must lie on the requested day, start before it ends, last 15 minutes to 8 hours, not start in the past, not overlap another proposal or an event with `may_overlap` = false, and refer only to the user's goals; at most 12 events. One failed check rejects the whole answer; nothing is saved.
- **R24** Voice: the browser's own speech recognition (English, Chrome) fills the editable input field. Our server receives text only.

**Payment, Outlook, travel**
- **R25** Stripe test mode only: if the secret key does not start with `sk_test_`, the server rejects it, payment stays off and the error is logged. The plan changes only on Stripe's signed message to our server, never from the browser's return page.
- **R26** Outlook sign-in happens at Microsoft. Read access is asked when connecting, write access only when writing is switched on; from then on, events with `source` `app` or `planner`, and their edits and deletions, go to Outlook. An event deleted in Outlook disappears from the app at the next sync. All-day events are not imported; Outlook's repeating events arrive as single events.
- **R27** Travel time needs a location that is not a web link and a home address (else "Add your home address in settings"). OpenStreetMap-based routing for the chosen mode; "© OpenStreetMap contributors" is shown. `leave_at` = start − travel minutes − buffer. The app may reuse a result for up to 6 hours; it is never stored with the event. Address not found: "Address not found", event unchanged.

## 7 What is saved, where, and who can see it
- **Email, password:** Supabase Auth, the password only as a hash (it cannot be turned back into the password).
- **All rows of section 3:** Supabase (Postgres) with row-level security. Seen only by the owner.
- **Outlook access:** encrypted in `calendar_connection`, read only by our server; never in the browser or extension.
- **Card details:** Stripe only; we keep `stripe_customer_id` and `plan`.
- **Planner input:** sent to the provider of Claude (R22). The text and the checked draft are saved; a failed answer is not.
- **Extension:** Chrome's storage holds the block list and blocking state, on that computer only.

**Secrets:** Claude API key, Supabase service key and connection string, Microsoft client secret, the key that encrypts the Outlook access, the routing service key, Stripe secret and webhook keys. Only on the server as environment variables, never in the public repository, the browser or the extension. After a leak: revoke the key, create a new one, check the provider's usage.

**When a service is down** (no crash; calls give up after 10 seconds):

| Service | The user sees | Unchanged |
|---|---|---|
| Database | "Your data cannot be loaded right now." (Free database woken before the demo.) | Nothing saved in the browser |
| Claude | "The planner is not available right now. Your calendar is unchanged." | Calendar, open draft |
| Outlook | Imported events with "Last synced 08:40"; new events marked "Not sent to Outlook" | App events |
| Routing | "Travel time not available" | The event |
| Stripe | "Payment is not available right now." | Plan |

## 8 Acceptance scenarios
| ID | Start | Action | Expected |
|---|---|---|---|
| A1 | Goal created last week; rule `count` 2 per week, `min_minutes` 45 | Runs of 50 and 40 minutes marked done; week ends | "1 of 2 done"; week `missed` |
| A2 | 60-minute session from 09:00, paused 09:20 to 09:30, 2 blocked attempts | `end_session` at 09:55 | Focused 45; score 75 − 10 = 65 |
| A3 | Goal with `auto_block` on; event 09:00 to 11:00; no session | Extension asks at 10:15; user opens instagram.com | Blocked until 11:00; attempt (instagram.com, 10:15) saved; off at 11:00 |
| A4 | Free user | Calls `request_plan` directly | "The AI planner is part of Pro"; Claude not called |
| A5 | Pro; fake Claude answer: study 08:00–13:00, call 13:30–14:00, sport 18:00–19:30, event 20:00–22:30 | `request_plan`: "Tomorrow I want to study from 8 to 1, a short call at 13:30, sport in the evening and an event at night"; then `accept_draft` | `open` draft, 4 proposals, calendar unchanged; after accepting, 4 events, `source` `planner` |
| A6 | Pro, 19 requests today; Claude proposes 13:30 to 13:00 | `request_plan` twice | First: "The planner's answer failed our checks. Please try again", no draft. Second: "Today's 20 planner requests are used", Claude not called |
| A7 | Same account on laptop and desktop | Laptop moves "Statistics revision" to 10:00; desktop, still on the old version, saves a new title | Both show the same events; desktop save rejected ("Changed on another device…"); event at 10:00, old title |
| A8 | User A; event E of user B | A requests E, then deletes E | "Not found"; delete rejected; E unchanged |
| A9 | Event 10:00 at "Nova SBE, Carcavelos"; home set; route 25 min; buffer 10 | Open event; then routing goes down | "Leave at 09:25"; then "Travel time not available", event unchanged |
| A10 | Any user | `start_session` with 25 minutes; `create_event` from 14:00 to 13:00; `add_blocked_site` with "not a site" | "Choose 15, 30, 60, 90 or 120 minutes" / "End must be after start" / "This is not a valid website"; nothing saved |

## 9 Open decisions
Defaults hold until we decide.
- To-do lists next to goals? Left out of the first version.
- Public transport for travel time? Not offered.
- Price of Pro? €5 per month, test mode, no trial.
- Default of `may_overlap`? false.
- Does finishing a session mark its event done? No, the user marks it.

## 10 Out of scope
Booking-page integrations; chat-tool status; calendar subscription links (ICS); an AI coach with chat, recommendations, daily sync and weekly review (our prototype had one); all-day events; repeating events created in the app; e-mail confirmation and password reset (first version); admin accounts, sharing, social features; a native phone app; calendars other than Outlook; other sign-in methods; habit, sport and cycle tracking; dark mode; games; screen-time measurement; travel stopovers.

## Where this comes from
Team meeting of 7 Nov 2026; our decisions of 10 Nov; the teaching staff's answers; the course wiki.
Lessons from our first prototype: its data lived in one browser only; we found its goal chart hard to read; it had other session lengths and a 1 to 5 rating.
