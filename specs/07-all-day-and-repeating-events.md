# Spec 07: All-day and repeating events
Build step 5, part 1 of 2 (Outlook is part 2). Plan: `docs/ontology.md`. Branch: `07-all-day-and-repeating`.

## Why
Users plan exam weeks as all-day events, and weekly lectures or runs as one series.

## What
- [ ] All-day "Exam week" Mon 16 to Fri 20 Nov 2026: first and last day, no times; shown at the top of its five days (R2, R29).
- [ ] All-day rejected, nothing saved: last day before first ("The last day cannot be before the first day"); 32 days ("An all-day event can last at most 31 days"); a goal ("All-day events have no goal").
- [ ] All-day: cannot be done ("All-day events cannot be marked done"), no conflict mark, never counts for rules or blocking (R29).
- [ ] A13: all-day "Exam week" Mon 16 to Fri 20 Nov; Tue 09:00–11:00 event of an `auto_block` goal: no conflict mark; asked Tue 10:00: blocked until 11:00; Wed 10:00: not blocked.
- [ ] R28: timed events repeat `daily`, `weekly` (chosen weekdays plus the first date's) or `monthly` (same day; months without it skipped) until `repeat_until`; one step, one `series_id`.
- [ ] A12: weekly Tue and Thu 09:00–10:00 from Tue 17 Nov 2026 until 18 Dec: 10 events, one `series_id`.
- [ ] Rejected, nothing saved: 101 dates ("A repeating event can have at most 100 dates"); `repeat_until` before the first date ("The end date cannot be before the first date").
- [ ] Monthly from 31 Jan 2027 until 30 Jun 2027: 31 Jan, 31 Mar, 31 May.
- [ ] `edit_event` with scope `this_and_following` changes this event and the later ones of its series; each keeps its date. `this` changes only the one.
- [ ] A12: `delete_event` `this_and_following` on Tue 8 Dec leaves 17, 19, 24, 26 Nov, 1 and 3 Dec.
- [ ] Two devices: the opened event's `updated_at` is checked ("Changed on another device. Reload to see the latest version"); the whole series change is one step (R4).
- [ ] The database enforces it all: all-day has days, no times, at most 31 days, no goal, never done, no series.
- [ ] Interface: an "All day" row above the hours, apart from the "Before 07:00" row; the editor has "All day" and "Repeat" (none, daily, weekly with weekdays, monthly, until); for a series it asks "This event" or "This and following events".

## Out of scope
Outlook (part 2), travel time, storing a repeat rule or extending a series (R28: create a new one), all-day events in the AI chat.

## Done when
All tests pass on a temporary database; output in the pull request. Deployed; an all-day event and a weekly series checked there. Reviewed by another member.
