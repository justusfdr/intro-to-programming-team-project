# Spec 49: Analytics in tabs, with widgets, details and a PDF export
Asked for by the owner on 18 Nov 2026. Plan: `docs/ontology.md`. Branch: `49-analytics-tabs`.
Mockups (sample numbers): https://claude.ai/artifact/4teAPydx5K5KghJbmEBijV

## Why
The Analytics page showed four numbers, one chart and a list. A user wants to see at a glance whether they reached their goals, how this week compares with other weeks, where their time went and what distracts them, read a short explanation of what goes well and what does not, and take the numbers of several weeks with them as a PDF.

## What
### One screen per tab
- [ ] The page has six tabs: Overview, Focus, Goals, Time, Streaks, Distractions. Round buttons above the widgets; the chosen one is black. The tab is kept in the address (`?tab=focus`), so a reload and the week arrows stay on it. Changing the tab does not ask the server again.
- [ ] On a screen at least 1000 px wide a tab never scrolls: its widgets sit in a grid of 4 columns and 2 rows that fills the height of the window below the header. Narrower screens stack the widgets and scroll.
- [ ] Previous week, next week and "This week" work as before (`?week=`).
- [ ] Every widget has a name, an icon in a soft colour and opens its details on click (or Enter). Charts are drawn with plain markup; each has the same numbers as text for screen readers.

### The numbers (all calculated when the page opens, nothing saved)
Weeks run Monday 00:00 to Sunday 24:00 in the user's time zone (R2). "The week" is the shown week. "Earlier weeks" always end with the shown week.
- [ ] Focus: focused minutes, finished sessions, focus score and blocked visits for the week and the week before (R19, R20, unchanged); focused minutes per day; the same four numbers for the 8 weeks ending with the shown week and the average focused minutes of those 8; how many sessions reached their planned length; on how many days there was a session.
- [ ] Best hours: finished sessions of the 8 weeks by the hour they started, in five blocks (before 9, 9 to 11, 11 to 14, 14 to 16, from 16): sessions and average focus score per block. The best block is the one with the highest average among blocks with at least 2 sessions; none if no block has 2.
- [ ] Best of the week: longest session (focused minutes), best session score, day with the most focused minutes. "–" when the week has no session.
- [ ] Goals: for every goal with at least one rule, each rule's progress in the week and the goal's week status (`met`, `missed`, `open`), exactly as R8 and R9 judge it (`src/lib/goals/progress.ts`). "Reached" counts goals whose week is `met`. The same count for the 3 weeks before. Weeks in a row: how many weeks in a row the goal was `met`, ending with the shown week (a week that is still `open` does not break the row and does not count). Days left to each deadline, counted from today; "No end date" for a goal without one.
- [ ] Plan, day by day: the timed events of the week that belong to a goal, per day: `done`, or planned and already over (`not done`), or still ahead (`planned`). What slipped: the `not done` ones, earliest first, at most 5.
- [ ] Time: minutes of `done` timed events per day and goal ("No goal" for events without one, or whose goal was deleted); the goals sorted by those minutes with the difference to the week before; the share that went to a goal; the busiest day (most done minutes). Plan kept: minutes of `done` timed events against minutes of all timed events of the week that have ended (0 ended minutes shows "–").
- [ ] Streak: days in a row, ending today (or yesterday while today has nothing yet; ending Sunday for an earlier week), on which the user finished a focus session or marked an event of a goal `done`. The record is the longest such run in the 12 weeks ending with the shown week. Both are capped by those 12 weeks (84 days).
- [ ] Last 12 weeks: focused minutes per day for the 84 days ending with the shown week's Sunday, in four levels: 0, under 60, under 120, 120 and more minutes.
- [ ] Focus by weekday: finished sessions per weekday over the 4 weeks ending with the shown week.
- [ ] Distractions: blocked visits of the week and the week before; visits per finished session; sessions without a blocked visit; blocked visits per week for the 8 weeks; blocked visits of the week by time of day (the five blocks); the five most blocked sites (R20).
- [ ] User A's numbers never include anything of user B (R3). Demo data counts like any other data.

### What goes well, what does not
- [ ] For each of the five topics (focus, goals, time, streaks, distractions) the server writes up to three short sentences under "Going well", up to three under "Needs attention" and a summary of one or two sentences. They are built from the numbers above by fixed rules in `src/lib/analytics/insights.ts`; no AI, nothing leaves the server. A rule only speaks when its numbers exist (no sentence about a goal when there are none; no comparison when the week before is empty).
- [ ] The Overview shows the first two of each list over all topics and one summary sentence; a widget's details show its topic's lists and summary.
- [ ] An empty week says so plainly ("No focus sessions this week yet") instead of showing zeros as bad news.

### Details
- [ ] Clicking a widget opens a dialog in the middle: the widget large, its topic's "Going well", "Needs attention" and summary. Closes with the cross, Esc or a click beside it. Focus returns to the widget.

### Edit widgets
- [ ] "Edit widgets" opens a dialog: per tab, every widget of that tab with a switch (shown or not) and its sizes (S = 1 field, M = 2 fields wide, L = 3 fields wide). The Overview can show any widget. A tab holds at most 8 fields (4 × 2); a change that does not fit is refused with "No room on this tab. Remove or shrink a widget first".
- [ ] The choice is saved per user (`save_analytics_widgets`) and applies on every device. "Reset" goes back to the standard layout. Nothing saved means the standard layout.
- [ ] The server checks the list again (known tab, known widget for that tab, a size that widget comes in, at most once per tab, fits in 8 fields) and refuses anything else without saving (R1).

### Export
- [ ] "Export" opens a dialog in the middle: a period (last week, last 4 weeks, last 8 weeks, or custom: first and last week, at most 26 weeks, never in the future) and a switch for each part: Summary, Goals, Productivity, Time facts, Trends and charts, Blocked sites. At least one part must be on.
- [ ] "Create PDF" downloads one PDF file with several pages, built on the server from the same calculations: a head with the period, then the chosen parts in that order; every page has a foot with the app's name, the period and "Page x of y". Tables break across pages without cutting a row.
- [ ] The file is made for the signed-in user only (R3), is not stored on the server and contains no data of other users.
- [ ] A period without any data still gives a PDF that says there was nothing in that period.

### Tests
- [ ] Every calculation above has tests with fixed dates, including: empty week, week before empty, a session exactly at midnight and at a week border, a time zone that is not UTC, a deleted goal, a goal without rules, a week that is still open.
- [ ] Each rule of `insights.ts` has a test where it speaks and one where it stays silent.
- [ ] `save_analytics_widgets`: accepted and each refused case; another user's layout is untouched.
- [ ] Export: the answer is a PDF (`%PDF-`), with the right number of pages for a small and a large period; refused without a session, with a bad period and with no part chosen.

## Not in this spec
- Travel time. The app calculates it when an event is open and never saves it (R27), so past weeks cannot be added up without asking the route service again for every event. It can follow once travel minutes are saved with the event (an ontology change).
- Texts written by the coach, comparing users, sharing a report, a scheduled report by e-mail.
- Widgets on phones are stacked, not arranged.

## Proposed ontology changes (the team confirms with the merge)
- R20 extended by the numbers listed above; "comparisons with earlier weeks" and "exporting" leave spec 06's out-of-scope list.
- New concept `analytics_layout` (Saved, in `settings`): per tab the widgets and their sizes.
- New actions `save_analytics_widgets` and `export_report`; new rules for the layout check and for what a report may contain.

## Done when
All tests pass on a temporary database; output in the pull request. Checked in the real app with a week that has sessions, goals and blocked visits, in Safari and Chrome. Reviewed by another member.
