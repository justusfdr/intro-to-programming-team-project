# Spec 13: Goal colours and icons, the demo week and the welcome
**This branch (`prototype-style`) is a variant for the team to compare with `main`.** It turns the app, step by step, into a copy of our first prototype's screens, with only the changes the owner decided. This is step 2. Plan: `docs/ontology.md` (R35, R36, `load_demo`, `remove_demo`, `start_fresh`, A18 to A20, added on this branch 12 Nov 2026). Migration: `supabase/migrations/20261120000000_goal_style_and_demo.sql` (additive: `main` runs against the same database).

## Why
In the prototype every goal has its own colour, icon and reason, so a glance at the calendar shows what each block is for. The rebuild showed one target icon and colours calculated from the order. And a new prototype account could explore a filled demo week first; a new account in the rebuild started empty without a word of introduction.

## What
- [ ] A goal has `color` (one of the prototype's ten, or empty), `icon` (one of its ten, default rocket) and `why` (up to 200 characters). A goal without a saved colour, such as every goal `main` creates, keeps the colour calculated from its place in the list (R35).
- [ ] `create_goal` and `edit_goal` accept the three fields; an edit that leaves them out keeps them; colour null goes back to the calculated one. Rejected, nothing saved (R1): "Choose a color from the list", "Choose an icon from the list", "Why it matters can be at most 200 characters", after the title, rule and deadline checks.
- [ ] The goal editor is laid out like the prototype's goal dialog: header with close, Name, Why it matters, the ten colour dots, the icon grid, then Deadline, the weekly rules and Auto-block; footer with Delete on the left, Cancel and Save/Create on the right. A new goal starts with the first unused colour.
- [ ] The goal's icon and colour everywhere a goal is shown: the goals column's tiles, rule rings and bars, the event blocks, the event editor's header tile and goal chips, the Focus page (goal line above the session's title, the goal's icon in the ring, the ring in its colour). "No goal" is a grey tile with a briefcase, as in the prototype. Analytics shows no goal today, so nothing changes there.
- [ ] The welcome dialog of the prototype (three steps, progress dots, bottom sheet on phones) for an account that has not answered it and has no goals, events or tasks. Texts as in the prototype without season, coach, week-start choice and shortcut tip. Step 3: "Explore the demo" or "Start fresh", the time format, "Connect Outlook", "Get started".
- [ ] `load_demo` writes the demo week (R36) as the signed-in user in one transaction, every row marked `demo`, and answers the welcome. Rejected, nothing saved: "The demo is already loaded" while any demo row is left; "You can have at most 100 open tasks" when the 7 open demo tasks do not fit.
- [ ] `remove_demo` ("Remove the demo data" in Settings, card "Your account", shown while demo rows are left, with a question that says changed demo items go too) deletes exactly the rows marked `demo`; the user's own rows stay, those under a demo goal lose the goal. Other accounts are untouched.
- [ ] `start_fresh` marks the welcome as answered and adds nothing.
- [ ] Demo events are never sent to Outlook and never marked "Not sent to Outlook".
- [ ] All three actions: thin route, same-origin check, size cap, zod (empty body), `withUser`, `handleAction`; 401 signed out, 403 from another site, 400 for any body field, each with a test that nothing changed.
- [ ] The database: the new columns have defaults `main` can ignore; checks on colour, icon and why; users may write colour, icon and why, may set `demo` only when adding a row and never change it, and may set `welcome_answered` on their own settings row.

## Out of scope
Habits, seasons, milestones, lists (the prototype's "Life admin"), archiving goals, guests, the coach, ratings and focus history in the demo, event locations in the demo (users cannot write locations yet), the Goals page, a "Reset demo" (load again after removing it is possible on the server, not offered on screen), the prototype's "skipped" status.

## Done when
All tests pass on a temporary database; server, database and rule tests unchanged (new ones added); the component tests that describe the old look are rewritten in the same commit as the change. `npm run check` and `npm audit --omit=dev` pass. Previews of the welcome, the demo week, the goal editor and the event editor read as the prototype's screenshots (`desk-01-welcome.png`, `desk-02-calendar.png`, `desk-03-event.png`). Reviewed by another member; the team decides between this branch and `main`.
