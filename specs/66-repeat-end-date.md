# Spec 66: The repeat's end date makes sense
Branch `repeat-until-fix`, from `main`. Asked for by the owner on 21 Nov 2026. No change to the database. Two existing tests change on purpose (listed under "Done when").

## Why
In the repeat choice of a new event, "Weekly" set the end a year ahead and showed it without the year ("Wed, Nov 17" in November 2026 meant 2027), so it looked like a wrong day in the past. Tapping a second weekday then moved the end date earlier without a word ("Sun, Oct 31"), because a series may have at most 100 dates.

## What
- [x] Until the user picks an end date, weekly ends after 12 weeks (daily 90 days and monthly a year, as before). This depends only on the frequency, so tapping days never moves it; even all seven days are 84 dates.
- [x] The end date names its year when it is not this year, in the Until field and in the repeat's sentence ("Every Thu · until Wed, Nov 17, 2027").
- [x] An end date the user picked is never shortened. When it gives more than 100 dates, the repeat choice says so ("A repeating event can have at most 100 dates. Choose an earlier end date or fewer days."); the server still refuses it as before.

## Ontology
Nothing changes: R28's limit of 100 dates stays; the default end date is a screen choice (issue #129).

## Out of scope
Changing the repeat of an event that already exists.

## Done when
`src/lib/events/repeat.test.ts`: the tests "weekly runs a year: 52 dates" and "weekly on several days stops at 100 dates instead of failing" held the old default and were changed: weekly now runs 12 weeks and keeps its end date whatever days are chosen. New: `src/components/calendar/editor/WhenSection.test.tsx` (the year in the sentence, the too-many check), `src/lib/time/display.test.ts` (`fmtDateShortFrom`). `npm run check` passes.
