# Spec 38: No preview column; the editor opens again
Decided by the owner. Branch `40-no-preview-photo-crop`, from `38-coach-common-time`. Plan: `docs/ontology.md` (`event preview`, `read_event_place`, R27's map, section 7's map entry and A35 marked withdrawn; A36 reworded; withdrawn 15 Nov 2026, spec 38, decided by the owner; the team confirms with the merge). No database change.

## Why
The owner (translated): "The new thing that opens the field on the right when you click a calendar event: I find it bad. It should not do that."

## What
- [x] A click (or Enter) on one of the user's own events opens the floating editor at the event, as before spec 35: no wait, no double-click meaning. Dragging and resizing are unchanged.
- [x] No column at the right, no shrinking grid, no bottom sheet for it. Removed: `EventPreview.tsx`, `clickIntent`, `previewDelay`, `ownPreview`, `guestRows`, TimeGrid's `minColumnPx` (only the panel used it; the profile's read-only week does not).
- [x] An event that is not the user's own (a shared calendar's, spec 29, or an invitation, spec 36) opens a small floating card at its block: title, date and time, place as text, whose calendar or "Invited by", the other invited people with their marks, and for an invitation Accept / Maybe / Decline with the current answer pressed. Escape and a click outside close it; the focus goes back to the block.
- [x] The owner's own event keeps its people in the hover card on the block and in the editor's "People in LockedIn".
- [x] The map is gone: `GET /api/events/[id]/place`, `event-place.ts`, `lib/map/osm-embed.ts` with their tests, and `frame-src` in the security policy. The editor's travel line is unchanged.

## Out of scope
The calendar loader still matches guests to contacts (`guestPeople`, spec 35's server part with its tests); nothing on the screen uses it any more. Taking it out is for the team to decide.

## Done when
`npm run check` passes; `npm audit --omit=dev` shows nothing; the reviewer tries it by hand in a browser.
