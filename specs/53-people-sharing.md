# Spec 53: People and shared calendars
> 18 Nov 2026, asked for by the owner ("I want to see my teammate's calendar in mine"). A port onto today's `main` of work already built and tested on older branches: spec 28 (profiles and contacts, branch `28-profiles-contacts`), spec 29 (sharing a calendar, branch `29-sharing-calendar`), spec 31 (profile page, branch `32-profile-page`) and spec 33 (people cards, branch `34-people-cards`), all taken from their last state on `origin/35-no-lists`. Port plan: sections A to H of the night's `calendar-port-plan.md`. Ontology: R3, R10, R22, R42, R43 and the new R52 to R58, A30 to A35.

## Why
Students plan together. Today each user sees only their own calendar, so finding a free hour with a teammate means asking. The database already has contacts, invitations and shares (migrations `20261203` to `20261206`, on `main` and live); the screens for them were built on branches that fell behind `main`. This brings back the smallest useful part: become contacts, choose what each contact sees, and see their calendar next to your own, read only.

## What
**People page (`/people`)**
- [x] Invite someone by e-mail address. The answer is always the same sentence, whatever the address is (no way to find out who has an account, R52).
- [x] Invitations for me (Accept, Decline; "They will see your name, photo and e-mail address."), invitations I sent (Withdraw), my contacts as cards (photo or initials, name, first line of the bio, local time and city, a mark of what they share with me), each a link to their page (R53, R54).
- [x] "People" in the sidebar under the main navigation, with the number of open invitations; on phones a "People" row in Settings (no new tab).

**A person's page (`/people/<id>`)**
- [x] Their card, read only: photo, name, e-mail address, bio, LinkedIn link (only the safe form), time zone with the local time there, without "Change in Settings" (R43). The same "Not found" for a stranger, a removed contact, an unknown id and a malformed id. My own id opens my profile page.
- [x] "What you share with <name>": Off / Free/busy / Details, saved at once, with the sentence "Free/busy shows when you are busy, to the minute. Details also shows titles and places, including events from Outlook." (R55). "Remove contact" with a confirm step.
- [x] "<name>'s week": their shared calendar for one week as a read-only list of seven days, in their time zone (named), previous and next week, "Shows free/busy only" or "Shows details", "Free" for an empty day, a sentence for an empty week, and "<name> does not share their calendar with you." when they do not (R56, R57).
- [x] "Show in my calendar": adds them to the calendars I show (the same choice as the calendar's People button) and opens the calendar.

**Calendar**
- [x] A "People" button in the toolbar when at least one contact shares their calendar with me: choose up to three to show (R58), remembered in this browser for this user.
- [x] Their events in day, week and month: in the person's colour (see "Colours and the level in the menu" below; striped until 19 Nov 2026), with their initials; "Busy" at free/busy; at details the title, and a click opens a small read-only card (title, time, place, whose calendar). All-day events in a row of their own under mine. In the day and week grid their blocks take the right part of a column; my own events keep the left part, and only on days that have shared blocks.
- [x] Their events never take part in dragging, creating, the editor, conflict marks or the overlap question (R10, R57), and are never sent to the coach (R22).

**Server and safety**
- [x] Every read of another user goes through the database functions that check the relation (`contact_cards`, `profile_card`, `profile_photo`, `shares_overview`, `shared_calendar`); no new SQL reads another user's rows. `app.shared_calendar` is asked in one file only, and the coach, Outlook, analytics and widgets never import the sharing code (a test checks it).
- [x] The photo is served only when the profile card would be shown too, so the database's older, wider check (lists, event invitations) never hands one out (R43).
- [x] `set_share` sends the stored focus flag back unchanged; the app never shows or changes it.
- [x] Previews with sample people (`npm run previews`): People, a person who shares details and one who shares nothing, the week (free/busy and details), the day on a phone, the month, the opened card.

## Decisions
- **No database change.** Every table and function exists on `main` and in the live database; the code calls them exactly as the migrations define them. The one place where the database is wider than the rule (R43's photo) is narrowed in our server, not in a migration.
- **Ported, not rewritten.** Files were copied from `origin/35-no-lists` and trimmed; only what the scope or `main` required was changed.
- **The person's week is a list, not the calendar grid** (Option B of the port plan): no second, read-only mode in the calendar's most changed component days before the deadline.
- **Plain names instead of hover cards**: a person's name elsewhere is a plain link to their page.
- **Rule and scenario numbers renumbered**: the branches' R44 to R51 are R52 to R58 here (`main` already uses R44 to R51); their A24 to A34 are A30 to A35.
- **The remembered choice of shown calendars is per user** (`lockedin.shownCalendars:<userId>`), so two accounts on one browser do not share it.

## Colours and the level in the menu, added 19 Nov 2026
Asked for by the owner after trying it with two accounts (translated): "I don't like the striped look much, make it different, simply use colours", and: when the other person changes from free/busy to details, their events show the details at once, but the People menu still says free/busy.
- [x] A colour per shown person instead of stripes (`src/lib/shares/colors.ts`): blue, purple or green, none of them a goal colour. A block, an all-day chip, a month row and a row of "<name>'s week" are filled with the colour and have a bar at the left edge and the person's avatar; no dashed border, no stripes. A person keeps their colour (worked out from their id); when two people shown together would have the same one, the one chosen later gets the next free colour, so the at most three shown (R58) always differ. The People menu shows the colour as a dot beside each shown person ("Shown in purple" for screen readers), and the read-only card has the same dot before the title.
- [x] The People menu's level ("free/busy", "details") follows the last read of that person's calendar, which happens when the days change and when the window gets the focus back. Before, it kept the level of the page's load. The list of people itself is still from the page's load: a person who started or stopped sharing shows after a reload.
- Tests: `src/lib/shares/colors.test.ts` (new); `src/components/calendar/Shared.test.tsx` (the "striped" case now expects the colour and no stripes; new cases for two people's colours and for the menu).

## Free/busy blocks open a card too, added 19 Nov 2026
Asked for by the owner (translated): when another person's shared calendar is shown and I hover or click one of their events, the grid treated the slot as empty. I want to click their event and see a card with its details, read only, like my own.
- [x] A free/busy block is a button like a details block: it opens the read-only card with the person (avatar and name, a link to their page), "Busy", the date and time, and the line "<first name> shares free/busy only." so it is clear why there is no title. No title or place exists at this level and the server still never sends them (R56).
- [x] The part after midnight of a block that runs past midnight takes the click too (same card); it stays hidden from screen readers and is not a second tab stop.
- [x] A click or pointer press on any shared block, timed, all-day or in the month, stops there: it never reaches the grid's empty area, so it never starts a new event. The details card is unchanged (title, date and time, place if any, person).
- Tests: `src/components/calendar/Shared.test.tsx` (the busy test no longer expects a note but a button; new cases for the busy card, no title or place, the card of a details block, the part after midnight, the click staying on the block).

## Out of scope
Left out on purpose, each to keep this change small and safe before the deadline:
- **Demo contacts** (spec 32): about 600 more lines touching every read path; one real second account does the same job.
- **Hover cards** on people's names (spec 33): a second floating panel mode for little gain.
- **The shared focus chart** (spec 29): its own route, reader and chart; the database keeps the flag, the app leaves it alone.
- **Event invitations** (specs 35 and 36) and **shared lists** (spec 30, withdrawn in spec 34).
- Editing other people's events, public links, groups, inviting people who are not users yet, blocking a user.

## Done when
Lint, types and the whole test suite pass, with tests for every security point of the port plan (E1 to E20: handled or written down as accepted). The previews show each screen. The pull request lists every ontology change and the few changed test expectations under "Needs the team's OK". Two real accounts can invite, accept, share, see each other's week and remove each other (manual list in the pull request).
