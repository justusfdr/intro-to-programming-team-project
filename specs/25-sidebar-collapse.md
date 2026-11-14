# Spec 25: Fold the sidebar to a strip of icons
Branch `25-sidebar-collapse`, built on `24-guests`. Asked for by the owner. No change to the server, the database or the ontology (it is only how the frame is shown).

## Why
The sidebar with Calendar, Coach, Focus and Analytics takes 232 px that the calendar could use. The owner wants to fold it, as familiar work apps do, and still reach it with the mouse. He also found that the calendar page could be scrolled up to an empty area.

## What
- [x] A button with an arrow to the left at the top right of the sidebar folds it to a strip of 60 px with only the icons (the mark, the pages, Settings, Sign out), each with its name as a tooltip and for screen readers.
- [x] Folded, the sidebar opens while the mouse is over it or the keyboard focus is inside it, and folds again when the mouse leaves. Opened like that it lies over the page with a shadow; the page does not move.
- [x] While it is open like that, the same button (now a pin) keeps it open for good.
- [x] The choice is remembered in this browser only (`localStorage`); a new browser starts with the sidebar open. Phones keep the tab bar.
- [x] The empty area: the goals column was as tall as the window but let its content run out of it, which made the whole page longer than the window. The column now scrolls inside itself.

## Out of scope
A keyboard shortcut for folding; remembering the choice in the account; folding on phones.

## Done when
`npm run check` passes; `AppShell.test.tsx` covers the open sidebar and its button. Tried by hand in a browser: fold, hover, leave, pin, reload; the calendar page no longer scrolls to an empty area.
