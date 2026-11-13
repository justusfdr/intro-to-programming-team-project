# Spec 19: The coach (AI chat)
Asked for by the owner on 13 Nov 2026. Plan: `docs/ontology.md` (the AI chat: `chat_message`, `draft_plan`, `send_message`, `accept_draft`, `reject_draft`, `clear_chat`, R1, R3 to R6, R21 to R24, R29, R31; changes of 13 Nov 2026 on this branch). Branch: `19-coach`. Two steps: A builds everything behind the screen; B, after review, builds the screen.

## Why
In the evening the user types or speaks what the next day should hold ("Tomorrow I want to study 4 hours, watch football in the evening, …", in English or German). The coach answers with a first draft of the day with times; "fits" turns it into events, "swap this and that" gets a new draft. Claude understands the sentence and proposes; our server checks every proposal with fixed rules; nothing changes in the calendar before the user accepts.

## What
Step A (server, database, the Claude module):
- [ ] `send_message` saves the user's message and the checked answer together; a draft answer becomes the one `open` draft and turns an older open draft `replaced`; the calendar is unchanged (A5).
- [ ] Who may use it (R21, R5): one server function, switched by `CHAT_PRO_ONLY` (`true`: Pro only, "The AI chat is part of Pro", Claude not called, nothing saved, A4; anything else: every signed-in user, the default until Free and Pro are built).
- [ ] At most 20 messages per user per calendar day in the user's time zone, counted in the database, atomically; the 21st gets "Today's 20 messages are used" and Claude is not called. The user can never write the counter. A failed message still counts (R1's exception, A6); a message refused before Claude is asked (Pro, limit, text, no key) does not.
- [ ] Order of work: count and commit; call Claude with no transaction open; check; save both messages and the draft in one transaction.
- [ ] Claude receives exactly R22's data (the last 10 messages with the events of their drafts, goals with deadlines and rules, the events from today to 14 days ahead, R31's totals, the time zone, the current local date and time, the visible hours) and nothing else: no email, password, locations, block list, payment data, tasks, or ids except goal ids (A11).
- [ ] Every answer passes R23's checks (timed only; start from now to the end of the 14th day; start before end; 15 minutes to 8 hours; no overlap with another proposal or a timed event with `may_overlap` = false; only the user's goals; at most 30; titles 1 to 100 characters; text 1 to 4,000), local times converted in the user's time zone (a time that does not exist fails). One failure: "The assistant's answer failed our checks. Please try again", nothing saved, counted, no second try (A6). A refusal, an answer cut off or one that is not JSON counts as failed.
- [ ] Claude down, timed out, refusing the key, or no key on the server: "The assistant is not available right now. Your calendar is unchanged"; calendar, chat and open draft unchanged.
- [ ] `accept_draft`: only an `open` draft of the user ("Not found" for any other id), no proposed event started and R23 still true against the calendar as it is now (else "This draft is out of date. Ask again"); all events created in one step with `source` `assistant`, the draft `accepted`. The database accepts a draft only once; two devices at once: one gets the events, the other "This draft is no longer open" (R4).
- [ ] `reject_draft`: `open` → `rejected`, else "This draft is no longer open". `clear_chat`: the user's messages and drafts deleted; events and today's count stay. Statuses only move forward (database trigger). Deleting the account deletes the chat.
- [ ] Assistant events behave like app events everywhere (edit, delete, done, sent to Outlook).
- [ ] Claude is called from one module (`src/lib/server/claude/`) with the official SDK: structured output, effort `medium`, `max_tokens` 16000, no streaming, 60-second timeout, at most one retry, refusal fallbacks for the models that take them (not Claude Haiku 5.5). Model `ANTHROPIC_MODEL`, else `claude-opus-5-5`. Only the kind of an error and its status are logged.
- [ ] Routes: `POST /api/chat/messages`, `POST /api/chat/drafts/[id]/accept`, `POST /api/chat/drafts/[id]/reject`, `POST /api/chat/clear`; a loader for the chat page in one read transaction.

Step B (the screen, another engineer, after review of step A):
- [ ] A page "Coach" in the app's navigation: the messages, an input that sends with Enter, the messages left today, "Clear chat".
- [ ] A draft drawn as its day (or days) in the calendar's style, between the events already there, with the goals' colours and icons; "Add to calendar" (`accept_draft`) and "Discard" (`reject_draft`); a replaced, rejected or accepted draft shown as such.
- [ ] Voice (R24): the browser's own speech recognition fills the editable input, English or German chosen next to the microphone; only in browsers that have it (else no microphone). Our server receives text only.
- [ ] The page says what is sent to Claude (R22). Without a key on the server it says the coach is not set up; with Pro only on, a Free user sees "The AI chat is part of Pro".
- [ ] Every refusal shows its message; nothing on the screen pretends a change that was not saved (R1).

## Out of scope
Coach recommendations, an evening check-in and a weekly review (ontology section 10); streaming answers; the assistant moving or deleting existing events; all-day proposals (R29); tasks in the chat (R32); payment for Pro (a later spec).

## Done when
All tests pass on a temporary database with the fake assistant, existing tests unchanged; `npm run check` and `npm audit --omit=dev` pass. The reviewer has applied the migration, set a key with a spending limit and tried a real conversation in English and in German. Step B: previews read as the same design as the calendar. Reviewed by another member; merged only after the owner confirms.
