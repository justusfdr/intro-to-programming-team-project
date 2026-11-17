# Spec 45: Widgets in the sidebar

Asked for by the owner on 17 Nov 2026 (issue #103); the team confirms with the merge. Design: the mockup
"LockedIn Sidebar-Widgets" (claude.ai artifact), agreed with the owner.

## What the user sees

Under the main navigation of the open sidebar (wider screens only; folded or on phones: nothing) a label
"Widgets" with a pencil, and under it a grid of 3 columns × 6 rows, each field 64 × 64 px, 8 px apart.
Only as many rows show as fit between the navigation and Pricing; a widget that does not fit is left out.
Nothing in the sidebar scrolls.

Six kinds of widget, each in its sizes (columns × rows):

| Kind | Sizes | Shows |
| --- | --- | --- |
| Weather | 3x2, 1x1 | Place with a small sign of where it comes from (R47), temperature, sky in words with its icon, high and low, the next four hours (time, icon, temperature, chance of rain from 30 %). 1x1: icon, temperature, sky. No animation. |
| Next up | 3x2, 3x4 | The event happening now or next today: goal icon, "Next up · in 34 min" (or "Now · 20 min left" with a progress bar), title, time and place, the leave line. 3x4 adds guests, to-dos (count and the first two), the weather where it is, and "Then …" for the event after it. With nothing left today: "Nothing else today" and tomorrow's first event. |
| Time to leave | 1x1, 3x1 | For the next event today with an address that has not started: the travel icon, "12 min", "to leave"; 3x1: "Leave in 12 min", time and trip length. Colour by `leaveLevel` (src/lib/widgets/leave.ts): >30 min soft green, 21–30 soft amber, 11–20 soft orange, 1–10 full red, 0 red and pulsing, late dark red. Without a trip: "No trip" in grey. |
| Goal | 1x1 | A ring in the goal's colour with its icon in the middle and "2 of 4" (its first rule, this week). Met: full ring with a check and "Done". |
| Focus today | 1x1 | Timer icon, minutes focused today, "focus today". |
| Free time | 3x1 | The next free stretch today of 30 min or more before the end of the visible day, and a "Focus" button to /focus. Without one: "No free time left today". |

Look (same as the rest of the app): Geist only; every widget a white tile with a 1 px #e8e8e8 border and
16 px corners; rows inside 8 px corners like the sidebar links; buttons full pills like `Button`; lucide
icons at stroke 1.8. Colour as a surface only for "Time to leave" and a goal that is met.

Editing: the pencil or a right-click on the grid. Widgets wiggle (not with reduced motion), each has a
minus to remove it and a size tag to switch to its other size (if it still fits); dragging moves a widget;
"Add widget" opens a list of the kinds (goal widgets per goal) with their sizes, greyed out when there is
no room; "Done" saves (`save_widgets`); "Reset" brings back the standard list. A refusal shows the message
and puts the last saved list back (R1).

Data: on opening and every minute while the page is visible, `widgets_data`; the weather on opening and
every 30 minutes; the trip with the existing `travel_times` for the one event to leave for.

## Ontology changes (with this spec)

- Concept **widget layout** (Saved, in `settings`): the user's list of widgets, each a kind, a size and for
  a goal widget its goal; none saved means the standard list.
- Action `save_widgets` (layout or "reset"), checked by R46. Action `widgets_data` (reads only). Action
  `weather` (reads only, nothing saved).
- **R46** A widget list is saved only if every widget is one of the six kinds, in one of its sizes, only a
  goal widget names a goal, and all fit together in the 3 × 6 grid (filled from the top, `pack`). Anything
  else changes nothing ("Choose a widget from the list" / "This widget does not come in that size" /
  "Choose one of your goals" / "The widgets do not fit. Remove one first"). A goal widget whose goal is
  gone is not shown. Tests: accepted a full grid and the empty list; rejected a 19th field, a wrong size,
  an unknown kind, a goal id on a weather widget, each with nothing changed.
- **R47** The weather is for the place the user is at: the device's location when the user allowed it in
  the browser, rounded on the server to two decimals (about 1 km) and never saved; else the place of the
  timed event happening now or the last one that ended today (not a web link); else the home address;
  else "Add your home address". Only the rounded coordinates go to the weather service (Open-Meteo); the
  addresses are turned into coordinates by the routing service already used for R27. The browser asks for
  the location only when the user clicks the location sign in the widget, never on its own.

## Not in this spec

Widgets on phones, more than one page of widgets, other weather services, °F, alerts, a week forecast.
