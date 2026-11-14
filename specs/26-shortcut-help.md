# Spec 26: Keyboard shortcut help
Issue #13. Branch `issues-batch`, from `main`. No change to the server, the database or the ontology (it only shows what exists; R37 keeps the calendar's keys).

## Why
The calendar has keys (R37) and the editor and the coach react to a few more, but nothing on the screen says so. People who like the keyboard should find them without reading the code.

## What
- [x] "?" on any signed-in page opens a dialog "Keyboard shortcuts" (in the shell, so it works on every page). Escape, the close button, a click beside it or "?" again close it, and the focus goes back where it was.
- [x] It lists only shortcuts that exist in the code today, grouped by where they work: every page (?, Esc closes a dialog or card); Calendar (D, W (not on phones), M, T, ← →, Esc cancels a drag); Event editor (Esc in the title puts the old title back; ↑ ↓ on a to-do's handle moves it); Coach (Enter sends, Shift + Enter for a new line; Esc cancels dragging a draft block).
- [x] The list is one data file (`src/lib/shortcuts/list.ts`); a later feature that adds a shortcut adds its line there.
- [x] It does not open while typing in a field (input, textarea, select, contenteditable), with Ctrl, Cmd or Alt held, or while another dialog or card is open.

## Out of scope
New shortcuts; changing keys; shortcuts on phones' touch keyboards; a shortcut for folding the sidebar.

## Done when
`src/lib/shortcuts/list.test.ts`: "?" opens, not in a field or with a modifier; every listed key is found in the file that handles it, and the calendar's keys are exactly those `shortcutFor` knows. `AppShell.test.tsx`: the closed dialog with every entry and the close button. `npm run check` passes. Tried by hand in a browser: ? opens and closes it, focus returns, nothing happens in a text field.
