# Spec 44: This week's circles on a goal
Asked for by Emily on 17 Nov 2026; the team confirms with the merge. Plan: `docs/ontology.md` (R9: circles added and the days of a goal without an end date, both 17 Nov 2026). Branch: `goal-week-sessions`.

## Why
A person wants to see on a goal, at a glance, how far they are this week: "I went to the gym 2 of 6 times". The words "This week: 2 of 6 done" said it, but nothing showed it. The design to follow is Emily's example card: the title with a row of circles at the right, a bar, the words, the strip of weeks as rounded boxes, and the caption.

## What
- [x] One round circle per session (`count`) or per hour (`hours`) of this week's target. A done circle is filled in the goal's colour with a white check; a part of an hour fills its circle partly; an open one is a ring in the goal's colour. A met rule has all circles full. Above 10 circles only the words show.
- [x] A goal with one rule shows its circles at the right of the title, so they stay visible while the goal is collapsed; a goal with several rules shows each rule's circles under its words.
- [x] Each rule's words as before ("This week: 2 of 6 done", "This week: 1.5 of 6 h"), without the small ring in front; a met rule is struck through with a check.
- [x] The strip of weeks stays (R9), drawn as in the example: 22px rounded boxes, a check on green for `met`, a cross on red for `missed`, a small ring for `open`, this week framed. Every week is still said in words for screen readers.
- [x] A goal without an end date (the gym, every week) shows the 7 days of this week instead of the strip of weeks: a letter over each box, Monday to Sunday; a check on green on a day a `done` event of the goal starts on; today framed; every other day empty, never a cross, because a rest day is no failure. On Monday it starts empty again. Worked out in `thisWeekDays` (`progress.ts`, pure, in the user's time zone); the weeks are still worked out for the coach.
- [x] The thin bar under the title is a little thicker (4px).
- [x] The circles are read from the rule's words (`ruleCircles` in `src/lib/goals/share.ts`, pure), like the bar, so they always agree with the text. They are only a picture: screen readers read the words. Hovering says "1 circle = 1 session" or "1 circle = 1 hour".
- Progress itself (R8) is unchanged: only `done` events of the goal count.

## Tests
- `src/lib/goals/circles.test.ts`: circles for count and hours rules, partly filled hours, a met rule, an empty week, more than 10 circles and no target.
- `src/components/goals/GoalCard-circles.test.tsx`: round circles in the goal's colour, the done ones full with a white check, the hover text, the hours case, the circles at the title also while collapsed, several rules.
- `src/lib/goals/progress-days.test.ts`: Monday to Sunday with today, two sessions on one day, the user's time zone, other weeks left out, the days in every goal's progress.
- In `GoalCard-circles.test.tsx` also: the 7 days in words for a goal without an end date, no cross; the weeks for a goal with a deadline.
- No existing test was changed.

## Not in this spec
- "3 of 4 sessions" with the number in bold, as in the example: the existing tests check the words "This week: 3 of 4 done" exactly, so this needs the team's OK.
- One unit for all goals (sessions only, hours goals converted). It touches the database, the coach (R45), the demo goals and many tests, and Justus's branch `goal-session-length` works on the same files.
- A weekly recap ("Wrapped") with an export as a file: planned, its own spec.
