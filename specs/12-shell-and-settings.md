# Spec 12: Shell, settings and the prototype's time format
> 15 Nov 2026: the goals column (and its phone sheet) was replaced by the Goals page, `/goals` (spec 39).

**This branch (`prototype-style`) is a variant for the team to compare with `main`.** It turns the app, step by step, into a copy of our first prototype's screens, with only the changes the owner decided. This is step 1. Plan: `docs/ontology.md` (display settings and R34 added on this branch, 12 Nov 2026). Migration: `supabase/migrations/20261119000000_settings_and_account.sql` (additive: `main` runs against the same database).

## Why
The owner found the rebuilt app too different from the prototype. Step 1 brings back what every page shares: the prototype's icons, its sidebar and phone tab bar, its 12-hour times and month-first dates, and its settings page, where Outlook, preferences, travel, the blocker and the account live.

## What
- [ ] Icons from the prototype's package (`lucide-react` 1.69.0, pinned); `src/components/ui/icons.tsx` keeps only the "not sent to Outlook" mark the package lacks.
- [ ] Sidebar as in the prototype: logo, Calendar, Focus, Analytics (Goals takes its place between Calendar and Focus later), Settings at the bottom, then the account row (Sign out). No AI-chat pill, search or quick-capture buttons until those features exist.
- [ ] Phones: the prototype's floating tab bar with Calendar, Focus, Analytics and Settings, each named for screen readers, the current page marked. Focus and Analytics are now reachable on a phone.
- [ ] Times as in the prototype (R34): "9am", "9 – 10:30am", "1:30pm · 1h", "12:10pm" on the now line; dates month-first ("Nov 16 – 22", "Mon, Nov 16", "Monday, November 16" for screen readers). Hour labels, event blocks, the now label, the event editor, the goals column's weeks, recent sessions, analytics and the Outlook status all follow the setting.
- [ ] `/settings` in the prototype's layout, one column of cards:
  - **Outlook calendar**: status pill (Connected / Ready / Sign in again / Not set up), Sign in with Microsoft, Sign in again, Sync now, Disconnect with its question, last sync. Without a Microsoft registration on the server: "Outlook is not set up on this server yet." and no button.
  - **Preferences**: time format (12-hour default, 24-hour), visible hours from/to (default 7am to 9pm), time zone.
  - **Travel**: home address, getting there (driving, cycling, walking), buffer. Saved now; nothing about leaving times yet.
  - **Focus blocker**: status, block list (add, remove, "n of 50"), install steps. The Focus page keeps only a small status chip that links here.
  - **Your account**: Sign out; Delete account after typing DELETE.
- [ ] The calendar's Outlook menu becomes the prototype's small chip ("Outlook · Last synced 8:40am" with a sync button, or "Connect Outlook"), linking to Settings; it is not shown when Outlook is not set up on the server.
- [ ] `update_settings`: saves only the fields sent. Rejected, nothing saved (R1): buffer not whole 0 to 120 ("Buffer must be 0 to 120 minutes"), unknown time zone ("Choose a time zone from the list"), address over 200 characters ("Home address can be at most 200 characters"), visible hours not whole, outside 0 to 24, or not ending after they start ("Visible hours must be whole hours, from 0 to 24, ending after they start"); unknown fields, values or an empty body ("Invalid request."). An empty address is saved as none. The database checks the format and hours again and lets a user change only these columns of their own row.
- [ ] `delete_account`: needs "DELETE" typed ("Type DELETE to confirm") and the Free plan ("Cancel Pro before deleting your account"). The database function `app.delete_account()` deletes only the signed-in user's sign-in account; every row of theirs goes with it; the session ends and the page goes to sign-in. Other users' rows stay.
- [ ] Both actions: thin route, same-origin check, size cap, zod, `withUser`, `handleAction`, signed in (401), from another site (403), too large (413), each with a test that nothing changed.
- [ ] Every input has a real label: settings fields, the block-list input, the goal editor's title, minimum minutes and auto-block switch, the event editor's start and end lists.

## Out of scope
Billing, the AI settings, export and import, demo reset, week start (weeks start on Monday), default view, the evening check-in, focus sounds, the "Show when to leave" switch and leave times (travel time comes later), separate import and send switches for Outlook (decided: both at once).

## Done when
All tests pass on a temporary database; server, database and rule tests unchanged (new ones added); the component tests that describe the old look are rewritten in the same commit as the change. `npm run check` and `npm audit --omit=dev` pass. Previews of the settings page, the week and the phone tab bar read as the prototype's screenshots (`desk-10-settings.png`, `desk-02-calendar.png`). Reviewed by another member; the team decides between this branch and `main`.
