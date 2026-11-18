# Spec 47: One day row for every goal
Asked for and approved by Emily on 18 Nov 2026 (after a mockup); the team confirms with the merge. Plan: `docs/ontology.md` (R9, changed 18 Nov 2026). Branch: `goal-day-row`, from `main` after spec 46.

## Why
Spec 46 gave each goal circles at the title and kept the strip of weeks; a goal without an end date showed its days instead. The cards then looked different from goal to goal, the circles at the title repeated the words under them, and a goal that runs a year would need 52 boxes. Every goal should look the same and say one thing: how this week is going.

## What
- [x] Next to the title, how far a goal with one rule is this week: "2/3", or "1.5/6 h" for hours, in the goal's colour. It stays while the goal is collapsed. A goal with several rules shows none there.
- [x] Per rule: "This week: **2** of 3 sessions" or "This week: **1.5** of 6 h", the number done in bold ("of 1 session" for one). A met rule is struck through with a check in the goal's colour; screen readers hear "met".
- [x] One row with the 7 days of this week, Monday to Sunday, for every goal, with or without an end date. Each day is a circle under its letter; today is ringed:
  - done (a `done` event of the goal starts that day): filled in the goal's colour with a white check;
  - missed (the day has ended and a `planned` event of the goal started on it): a red cross;
  - planned (today or later, with a `planned` event of the goal): a dashed ring in the goal's colour;
  - otherwise empty. A rest day is never a cross.
- [x] The strip of weeks and spec 46's circles are gone from the goal. Countdown, "No end date", auto-block and "Plan with coach" stay in the caption. Progress itself (R8) is unchanged.
- [x] The goals page reads the goal's planned timed events from 8 days before to 8 days after now, besides its done events (`src/lib/server/goals/load.ts`); `thisWeekDays` in `progress.ts` (pure, user's time zone) turns them into the days.

## Tests
- `src/lib/goals/progress-days.test.ts` (extended): missed and planned days, done wins over planned, no cross without a planned session, planned events in a goal's progress.
- `src/lib/server/goals/load-days.test.ts`: done and planned days from the database; other goals' and other users' events do not count (R3).
- `src/components/goals/GoalCard-days.test.tsx` (spec 46's circle tests rewritten): the number next to the title also collapsed, bold number and "sessions", the 7 days in words with today ringed, done/missed/planned looks, no cross on a rest day, the same for a goal with a deadline, several rules.
- Changed with Emily's approval of 18 Nov 2026, because R9's words and strip changed: `GoalCard.test.tsx`, `GoalCard-end-date.test.tsx`, `GoalSection.test.tsx`, `TaskList.test.tsx`, `PlanWithCoach.test.tsx`. Each change has a comment.

## Not in this spec
- One unit for all goals (sessions only).
- A weekly recap ("Wrapped") with past weeks and an export as a file.
