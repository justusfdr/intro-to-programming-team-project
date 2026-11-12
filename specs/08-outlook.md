# Spec 08: Outlook in both directions
Build step 5, part 2 of 2. Plan: `docs/ontology.md`. Branch: `08-outlook`.

## Why
Students keep lectures and meetings in Outlook. The calendar should show them, and Outlook should show what they plan here.

## What
- [ ] `connect_outlook`: Microsoft sign-in with PKCE (S256) and a `state` tied to the signed-in user; asks for `Calendars.ReadWrite` and `offline_access` at once (R26). Declined, wrong user, old or forged `state`: "Outlook was not connected", nothing saved.
- [ ] The refresh token is saved only encrypted (AES-256-GCM, fresh 12-byte nonce, 32-byte key from the server's environment); users cannot read or write that column.
- [ ] `sync_outlook` when the calendar opens, at most every 5 minutes (checked by the server), from 7 days back to 60 ahead. Outlook's repeating events arrive as single events, all-day ones as all-day (R29), cancelled and "free" ones not at all; events deleted in Outlook vanish.
- [ ] Every app or assistant event that has not ended goes to Outlook in batches of 20, at most 100 per sync, with later edits and deletions; the next sync sends what is left.
- [ ] Outlook down, slow (10 seconds) or throttling (429): imported events stay, "Last synced 08:40"; unsent events show "Not sent to Outlook" and go at the next sync.
- [ ] Microsoft refuses the stored access: status `needs_reconnect`, "Reconnect Outlook".
- [ ] R11: an Outlook event's title, times, days and location are refused, also by the database: "Change this event in Outlook". Its goal and done status can change; it cannot be deleted here.
- [ ] `source` and `outlook_id` stay unwritable by users; import and "sent" go through database functions for the user's own rows.
- [ ] `disconnect_outlook`: the connection and the imported events are deleted; what the app wrote stays in Outlook.
- [ ] User A's sync never touches user B's rows (R3).
- [ ] Interface: an "Outlook" button in the calendar toolbar opens a panel to connect, see the status and last sync, reconnect and disconnect. Outlook events carry an Outlook mark; their editor shows title and times as text, the goal and "Mark done", and "Change this event in Outlook".
- [ ] All Microsoft calls go through one module with a real and a fake implementation; tests use recorded answer shapes, never Microsoft.

## Out of scope
Calendars other than Outlook, choosing which Outlook calendar, attendees and invitations, Outlook's own repeat rules, locations of app events (travel time, step 7), admin consent for organisations.

## Done when
All tests pass on a temporary database; output in the pull request. Deployed with a registered Microsoft app; one account connected, synced both ways and disconnected there. Reviewed by another member.
