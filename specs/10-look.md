# Spec 10: The look of our first prototype
Interface only, no build step of its own. Plan: `docs/ontology.md` (unchanged). Branch: `10-look`.

## Why
The user sent three pictures of our first prototype and said "this is how it should look": the goals column, the event editor and the Analytics page. The app has the same design tokens already; this step brings the screens to the same look without changing what the app can do.

## What
- [ ] Goals column: one section per goal without a card border: a chevron that collapses the section (remembered per goal in this browser), a 28px tile tinted in the goal's colour with a target icon, the title in bold over the whole width (it opens the goal editor). Under it a thin bar for how far this week's rules are, then one row per rule ("This week: 1 of 2 done"): a ring in the goal's colour while open, a filled circle with a check and struck-through grey text when met. Then the strip of weeks, compact, and one muted caption line: the countdown ("Deadline passed" as a red chip) and "Auto-block on" when it applies. A grey "+ New goal" row ends the column.
- [ ] The bar's number is calculated, never saved: per rule its share of the target (a met rule counts as full), averaged over the goal's rules.
- [ ] A goal is shown with one neutral icon (a target) in its colour everywhere: the column, the editor's goal chips, the editor's header. "No goal" has a grey tile.
- [ ] Event editor: a panel at the right edge on wider screens (a sheet from the bottom on phones, as before). Header: tile, title, close. The chips "Done", "Repeating", "From Outlook", "Not sent to Outlook", "Overlaps another event". Sections with small upper-case labels: When (all-day switch, a date box, start and end side by side with the length next to the end, "· 2 h"), Repeat, Overlap, Goal (pill chips, radio inputs named `goal`, so the form sends the same value), Location for Outlook events. A fixed footer: Save, Start focus with a play icon, Mark done or Reopen, and the bin icon.
- [ ] Times stay 24-hour ("09:00"). Start and end are chosen in 15-minute steps; the end list runs up to 24 hours after the start and says "next day" past midnight. Keeping the length when the start moves is the only new behaviour, and it is on the screen only; the server checks every value as before.
- [ ] The goal editor gets the same header, labels and footer.
- [ ] Analytics: the same numbers and table in the picture's layout: big title, round previous and next buttons, a "This week" pill, four cards, upper-case card labels, the full page width.
- [ ] Calendar, sidebar, Focus page and account pages: changed only where they differ from the prototype (the line for the current time in red, page widths as on Analytics).
- [ ] Every status is said in words, not only by colour; every control has a name and a visible focus; the phone layouts keep working.

## Out of scope
What the pictures show but the ontology does not have, or has for a later step: tasks under goals and an inbox (open decision "To-do lists next to goals", default left out), to-dos, notes, a rating and a task link inside an event, a location input for app events (comes with travel time, step 7), Day and Month views, comparison with last week, time by goal, habits, energy, seasons, search, a quick-capture button, a settings entry, a coach column. Icons per goal (the data has none). 12-hour times.

## Done when
All existing tests pass unchanged; new tests cover collapsing a goal and the bar's number. `npm run check` passes. The previews of the goals column, the editor and Analytics read as the same design as the pictures. Reviewed by another member; merged only after the user confirms.
