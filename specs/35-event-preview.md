# Spec 35: The event preview with a map

**Withdrawn 15 Nov 2026 by the owner's decision** (spec 38): the preview column and its map are gone. A click on one's own event opens the editor again; other people's events open a small card at their block. The text below is kept as a record.
Asked for by the owner. Branch `36-event-preview`, from `35-no-lists`. Plan: `docs/ontology.md` (`event preview`, `read_event_place`, R27 extended by the map, section 7's map entry, A35; added 15 Nov 2026, spec 35, asked for by the owner; the team confirms with the merge). No database change.

## Why
The owner (translated): "A kind of preview for a single event. Best folded out on the right, so the calendar on the left gets smaller. There you see what it is called, who is invited and at what time. Below, a map. The address must go into a map, and one should see on the map where you have to go, and also the travel time." Decided with the reviewer: on the right, OpenStreetMap (no key, and address search and travel times already use it).

## What
- [x] Opening: a single click on an event in the week, day or month view (also an all-day bar) opens the preview at the right instead of the editor. A double-click opens the editor at once; the panel's "Edit" opens it too (unchanged). Clicking another event switches the panel; the close button and Escape close it. A drag or a resize is not a click. The "New event" card is unchanged. A shared event of another person opens the same panel without "Edit" (instead of the small read-only card of spec 29; the profile page's week keeps that card).
- [x] The click decision is one pure function (`clickIntent` in `src/lib/events/preview.ts`): the click that ends a drag is ignored, the second click of a double-click is "editor", every other click and every keyboard click is "preview". While the panel is closed, a mouse click waits 250 ms before it opens the panel (`previewDelay`), because opening it narrows the grid and the event could move away under the pointer before the second click.
- [x] Layout: from 1024 px a 360 px column at the right edge of the calendar area; the calendar shrinks beside it, and in the week view each day keeps at least 64 px and the grid scrolls sideways inside itself. From 768 px the panel lies over the right part of the calendar; on phones it is a sheet from the bottom. The open panel lives only in the current visit (React state, no storage).
- [x] What it shows, top to bottom, leaving out empty parts: the goal's colour dot and name; the title; the date and time ("Sat, Nov 14 · 2:30pm to 3:45pm", past midnight with both days, "all day" for one or several days); "Repeats (part of a series)"; the guests (a contact as their chip to their profile, anyone else as the address; an Outlook event's organizer first, marked "Organizer"); "2 of 4 to-dos done" and the open to-dos as plain text; the notes as plain text with their line breaks; the place. Nothing can be changed in it.
- [x] Place: an https web link is a link (`target="_blank"`, `rel="noopener noreferrer"`), any other web address plain text, both without a map. An address shows as text, then the travel line (R27) when it can be worked out or the hint to add a home address, then the map: OpenStreetMap's own embed in an iframe (`loading="lazy"`, `referrerpolicy="no-referrer"`, `sandbox="allow-scripts allow-same-origin"`, a title, 220 px high), "Open in OpenStreetMap" and "© OpenStreetMap contributors". Not found: "Address not found on the map", no iframe. A shared event's place is text only and never looked up.
- [x] Coordinates: `GET /api/events/[id]/place` (`src/lib/server/actions/event-place.ts`), the same checks as `travel_time` (same origin, signed in, the user's own event, "Not found" for any other id), the same look-up and 6-hour memory of the routing module, at most 60 questions per user per minute. The answer is one of `{status:"found",lat,lon}`, `{status:"none"}`, `{status:"not_found"}`, `{status:"unavailable"}`. The map's addresses come from one pure function that takes two numbers only (finite, latitude −90 to 90, longitude −180 to 180, rounded to 5 decimals; `src/lib/map/osm-embed.ts`).
- [x] Guests as people: the calendar page loader matches the shown events' guest and organizer addresses against the user's own contacts on the server and sends address → `{ userId, name, photoUrl }` for those only. The to-dos' titles come from the existing `GET /api/events/[id]/todos`.
- [x] Security headers: `frame-src https://www.openstreetmap.org` added to the content security policy, nothing else changed; `frame-ancestors 'none'` stays.
- [x] Keyboard and screen readers: the panel is a region named by its heading; opened by the keyboard, the focus moves to the heading; closed, the focus goes back to the event. The event blocks keep their names.

## Decisions
- Dates follow the app's month-first style ("Sat, Nov 14"), the times the user's 12- or 24-hour setting.
- No repeat rule is stored for a series (R28, migration `20261116000000_all_day_and_repeating.sql`), so the panel says "Repeats (part of a series)" and not how often.
- The demo contacts have no e-mail address, so a guest is never matched to one (R58: never guests).
- The goals column sits on the left of the calendar, so it never competes with the preview for the right side; both can be open.
- The travel line in the panel is left out when the travel time cannot be worked out (address not found, service down); the map says "Address not found on the map" or "The map is not available right now" instead.

## Out of scope
Looking up other people's places; editing in the panel (ticking to-dos stays in the editor); remembering the open panel across visits; a route line on the map.

## Done when
`npm run check` passes; `npm audit --omit=dev` shows nothing; the reviewer tries it by hand in a browser.
