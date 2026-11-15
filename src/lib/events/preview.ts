// The pure parts of the small read-only card of an event that is not the user's own (a shared calendar's
// or an invitation; spec 35's preview column was withdrawn by spec 38, these parts stayed): the date and
// time in one line, and the place. Only a display of data the calendar already has. Tested in preview.test.ts.
import { fmtDateShort, fmtTime, type TimeFormat } from "@/lib/time/display";
import { isWebLink } from "@/lib/travel/web-link";

/** When an event takes place, on the viewer's clock. */
export type WhenInput =
  | { allDay: false; startLocal: string; endLocal: string }
  | { allDay: true; firstDay: string; lastDay: string };

/**
 * The date and time in one line, in the user's time format and the app's month-first dates:
 * "Sat, Nov 14 · 2:30pm to 3:45pm"; past midnight "Sat, Nov 14 · 11pm to Sun, Nov 15 · 1am";
 * all day "Sat, Nov 14 · all day"; several days "Sat, Nov 14 to Mon, Nov 16 · all day".
 */
export function whenSentence(when: WhenInput, format: TimeFormat): string {
  if (when.allDay) {
    const days = when.lastDay === when.firstDay ? fmtDateShort(when.firstDay) : `${fmtDateShort(when.firstDay)} to ${fmtDateShort(when.lastDay)}`;
    return `${days} · all day`;
  }
  const startDay = when.startLocal.slice(0, 10);
  const endDay = when.endLocal.slice(0, 10);
  const start = fmtTime(when.startLocal.slice(11, 16), format);
  const end = fmtTime(when.endLocal.slice(11, 16), format);
  return startDay === endDay ? `${fmtDateShort(startDay)} · ${start} to ${end}` : `${fmtDateShort(startDay)} · ${start} to ${fmtDateShort(endDay)} · ${end}`;
}

/** Where an event takes place, as a card shows it. */
export type PlaceView =
  | { kind: "none" }
  /** An online meeting with a whole https address. */
  | { kind: "link"; href: string; text: string }
  /** A web address that is not https: plain text, never a link. */
  | { kind: "text"; text: string }
  /** A place: the address as text. */
  | { kind: "address"; text: string };

/** The place of an event: nothing, a safe link, plain text, or an address. */
export function placeOf(location: string | null | undefined): PlaceView {
  const text = location?.trim() ?? "";
  if (text === "") return { kind: "none" };
  if (!isWebLink(text)) return { kind: "address", text };
  try {
    const url = new URL(text);
    if (url.protocol === "https:" && url.username === "" && url.password === "") return { kind: "link", href: url.href, text };
  } catch {
    // Not a whole address (for example "www.example.com" or "zoom: 123"): text only.
  }
  return { kind: "text", text };
}

/** Someone of the user's own contacts, found by a guest's address (matched on the server, lib/people/guest-match.ts). */
export type GuestPerson = { userId: string; name: string; photoUrl: string | null };
