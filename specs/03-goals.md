# Spec 03: Goals
Build step 2. Plan: `docs/ontology.md`. Branch: `04-goals`.

## Why
Users set goals with weekly rules, link events and see whether each week is on track.

## What
- [ ] `create_goal` "Run a half marathon", deadline 2027-03-14, rule `count` 2 with `min_minutes` 45: goal and rule saved together, `auto_block` false.
- [ ] Rejected, nothing saved (R1): empty or 81-character title ("Title must be 1 to 80 characters"); no rule ("Add at least one rule"); deadline before today ("The deadline cannot be in the past").
- [ ] R7: `count` 0 or 15 ("Target must be 1 to 14 events"); `hours` 0 or 60.5 ("Target must be 0.5 to 60 hours"); `min_minutes` 14 or 241 ("Minimum length must be 15 to 240 minutes").
- [ ] `edit_goal`: same checks; an unchanged past deadline stays allowed; rules added, changed and removed in one step.
- [ ] `remove_rule` on the last rule: "A goal needs at least one rule".
- [ ] `delete_goal` deletes the goal and its rules; its events stay, without goal.
- [ ] User B's goal or rule is "Not found" for user A; B's rows stay (R3).
- [ ] An event links only to its owner's goals, also on direct database calls.
- [ ] Goal edit or delete with an older `updated_at`: "Changed on another device. Reload to see the latest version" (R4).
- [ ] Only `done` events of the goal count; `min_minutes` excludes shorter ones; `hours` adds lengths (R8).
- [ ] A1: created last week, `count` 2, `min_minutes` 45, runs of 50 and 40 minutes done: "1 of 2 done", week `missed`.
- [ ] The creation week is never `missed`; weeks after the deadline are not judged; weeks run Monday to Sunday in the user's time zone.
- [ ] Panel per goal: "This week: 1 of 2 done" or "This week: 3.5 of 6 h", a strip of weeks readable without colour, "12 days left" or "Deadline passed" (R9).
- [ ] The panel collapses and opens again; on a phone it opens as a sheet.
- [ ] Events show their goal's colour, calculated, never saved.
- [ ] `auto_block` is saved and switchable; it blocks nothing yet.

## Out of scope
Blocking, focus sessions, all-day and repeating events, Outlook, the AI chat, analytics.

## Done when
All tests pass on a temporary database; output in the pull request. Deployed; one goal with two rules and linked events checked there. Reviewed by another member.
