# Spec 39: Goals as a page of its own
Branch `41-goals-page`, from `main`. Asked for by the owner, 15 Nov 2026; the team confirms with the merge. No change to the server's actions, the database or the ontology's rules (the ontology says nowhere where goals are shown).

## Why
The owner: "I want Goals to be a page of its own, like Coach, and not shown at the side any more. I find that silly." The column took 280 px beside the calendar and on phones opened as a sheet over it.

## What
- [x] A page `/goals`, signed in only, reached from "Goals" in the sidebar (second, a normal link, marked on the page) and in the phone tab bar (second; the tab bar's gaps are 2 px so seven icons fit 375 px).
- [x] The page shows what the column showed: the title "Goals" with "New goal"; one card per goal (tile in its colour and icon, title that opens the editor, this week's bar and rules, the strip of weeks, the countdown, "Auto-block on", its tasks with tick, add, edit, delete, due dates and overdue marks); then "Inbox" as its own card; the same empty state. Cards sit in a grid of 1 column, 2 from 768 px, 3 from 1280 px. A card still collapses, remembered in this browser under the same key as before.
- [x] One page loader (`loadGoalsPage`): old done tasks removed by themselves (R33), then one transaction that reads settings, goals and tasks with the calendar's own reading code. The page refreshes like the column did (`LiveProvider`, `router.refresh()` after each action).
- [x] The calendar has no goals column, toggle, remembered open state or phone sheet any more, and takes the full width. It still reads the goals for colours, names and the editor's goal chips. `PanelState`, `close-when-wide` and the shell's side-panel slots are removed (old `localStorage` keys are left alone).
- [x] The due date of a task and the deadline of a goal use the event editor's date field ("Sun, Nov 15" and the app's small month calendar) instead of the browser's date input. An empty due date shows "Add due date" and can be removed again; days before the earliest allowed date cannot be picked.

## Out of scope
New goal or task features; ordering goals; a goal's own page; changing the goal editor beyond its deadline field; keyboard shortcuts for the page.

## Done when
`goals-load.test.ts` (2 transactions, the calendar's data, the local date, only the user's rows), `GoalsPage.test.tsx`, the rewritten markup tests (`TaskList.test.tsx`, `GoalEditor.test.tsx`, `AppShell.test.tsx`, `CalendarView.test.tsx`) and every other test pass unchanged; `npm run check` and `npm audit --omit=dev` pass. Tried by hand in a browser at 375 px, 768 px and 1280 px. Reviewed by another member; merged only after the owner confirms.
