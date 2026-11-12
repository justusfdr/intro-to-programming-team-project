# Spec 06: Analytics and focus score
Build step 4. Plan: `docs/ontology.md`. Branch: `06-analytics`.

## Why
A user sees how much they focused, how well, and what distracted them, per day and per week, calculated from what the app already saved.

## What
- [ ] R19: per finished session, focus score = 100 × focused minutes ÷ planned minutes, rounded, minus 5 per blocked attempt during the session, kept between 0 and 100.
- [ ] A2: 60 minutes planned, 45 focused, 2 attempts during the session: 75 − 10 = 65.
- [ ] Ending early lowers the score: 60 planned, 30 focused, no attempts: 50. 25 attempts in a full session: 0, not below.
- [ ] An attempt counts for a session only when its time lies from the session's start to its end; attempts outside any session (for example during an auto-block event) count for the day but for no score.
- [ ] A day or week shows the average score of its finished sessions, rounded; with no sessions it shows "–", not 0.
- [ ] R20: per day and per week: focused minutes, finished sessions, focus score, blocked attempts, and the five most blocked sites with their counts.
- [ ] Days and weeks run Monday 00:00 to Sunday 24:00 in the user's time zone; a session belongs to the day it starts, an attempt to the day it happened (R2).
- [ ] Running and paused sessions do not count yet; a session that finished by itself counts (R13).
- [ ] User A's numbers never include user B's sessions or attempts (R3).
- [ ] Nothing is saved: no new table, everything is calculated when the page opens.
- [ ] The Analytics page: this week's totals, today's numbers when the week is the current one, a bar per day with a table of the same numbers behind it, and the most blocked sites; previous and next week.
- [ ] Every chart can be read without colour and by a screen reader (a table or list with the same numbers).
- [ ] "Analytics" in the sidebar.

## Out of scope
Goal time in analytics (the AI chat's totals, R31, come in step 6), ratings and energy, month views, comparisons with earlier weeks, exporting.

## Done when
All tests pass on a temporary database; output in the pull request. Deployed; a week with sessions and attempts checked there. Reviewed by another member.
