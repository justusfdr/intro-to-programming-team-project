# Spec 52: Settings with a list of sections
> 18 Nov 2026. Layout A of the settings mockups (design canvas "LockedIn Settings Mockups"), chosen by the owner.

## Why
The settings page had grown into one long column: profile, Outlook, preferences, travel, the blocker with a five-step install guide, and the account. Finding one setting meant scrolling past all the others.

## What
- [ ] `/settings` shows a list of sections on the left and the open section's cards on the right:
  - on top: **Your profile** (photo or initials and name, to `/profile`);
  - **Planning**: Calendar (Outlook card, then Preferences with the time zone), Travel;
  - **Focus**: Focus blocker;
  - **Account**: Account and plan (plan, demo data, sign out, delete account).
- [ ] A dot next to a section's name: Calendar green when Outlook is connected, red when it needs signing in again; Focus blocker red while not connected, green when connected. Screen readers hear it in words ("needs you", "on").
- [ ] The open section lives in the address: `#calendar`, `#travel`, `#blocker`, `#account`. The links that already exist keep working: `#outlook` opens Calendar, `#blocker` opens the blocker. Without a part, wide screens show Calendar.
- [ ] Phones (below 768 px): the list fills the screen with each section's current value ("Outlook: connected", the home address, "Not connected", "Free plan"); a section opens on its own with "‹ Settings" to go back; the browser's back button also returns to the list.
- [ ] All cards stay on the page, the closed sections hidden, so typed text is kept when switching.
- [ ] The blocker's install guide is one row, "Install the extension · Five steps, about two minutes, in Chrome", that opens the five steps. When connected it stays "Install on another computer" as before.

## Out of scope
New settings (appearance, accent colour, theme, notifications, profile visibility, focus time of day, data download), a search field, and a heading per section: the mockups show them, but they need their own spec and, for some, new columns.

## Done when
Every settings value saves as before (no server or database change). Settings and profile component tests extended, none removed. Lint, types, tests and build pass.
