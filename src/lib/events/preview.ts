// The event preview panel (spec 35): what a click on an event means, and what the panel shows of an
// event. Only a display of data the calendar already has; nothing here changes anything. Pure, tested in
// preview.test.ts.
import type { CalendarEvent } from "./types";
import { fmtDateShort, fmtTime, type TimeFormat } from "@/lib/time/display";
import { isWebLink } from "@/lib/travel/web-link";

/** What a click on an event block does. */
export type ClickIntent = "preview" | "editor" | "ignore";

/**
 * A click on an event: the click that ends a drag or a resize is ignored (a drag is not a click); the
 * second click of a double-click opens the editor; any other click, also Enter or Space on the keyboard
 * (`detail` 0), opens the preview. A keyboard click is never ignored.
 */
export function clickIntent(detail: number, afterDrag: boolean): ClickIntent {
  if (detail === 0) return "preview";
  if (afterDrag) return "ignore";
  return detail >= 2 ? "editor" : "preview";
}

/** How long a mouse click waits before the panel opens, so a double-click can still become the editor. */
export const DOUBLE_CLICK_WAIT_MS = 250;

/**
 * When the preview opens after a click that asks for it. Opening the panel beside the calendar narrows
 * the grid, so the event can move away under the pointer before a second click: a mouse click therefore
 * waits briefly while the panel is closed (a second click in that time opens the editor instead). A
 * keyboard click, and a click while the panel is already open (it only switches), open at once.
 */
export function previewDelay({ panelOpen, byKeyboard }: { panelOpen: boolean; byKeyboard: boolean }): number {
  return panelOpen || byKeyboard ? 0 : DOUBLE_CLICK_WAIT_MS;
}

/** When an event takes place, in the shape the panel needs (also a shared event of another person). */
export type WhenInput =
  | { allDay: false; startLocal: string; endLocal: string }
  | { allDay: true; firstDay: string; lastDay: string };

/** The when of one of the user's own events as the calendar holds it. */
export function whenOf(event: CalendarEvent): WhenInput {
  return event.allDay
    ? { allDay: true, firstDay: event.firstDay, lastDay: event.lastDay }
    : { allDay: false, startLocal: event.startLocal, endLocal: event.endLocal };
}

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

/** Where an event takes place, as the panel shows it. */
export type PlaceView =
  | { kind: "none" }
  /** An online meeting with an https address: a link, no map. */
  | { kind: "link"; href: string; text: string }
  /** A web address that is not https: plain text, never a link, no map. */
  | { kind: "text"; text: string }
  /** A place: the address as text, the travel line and the map. */
  | { kind: "address"; text: string };

/** The place of an event: nothing, a safe link, plain text, or an address for the map. */
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

/** Someone of the user's own contacts, found by a guest's address (matched on the server). */
export type GuestPerson = { userId: string; name: string; photoUrl: string | null };

/** One guest row of the panel: a contact's chip, or the plain address. */
export type GuestRow = { address: string; person: GuestPerson | null; organizer: boolean };

/**
 * The guests in the panel's order: an Outlook event's organizer first (marked), then the guests, each
 * address once. A guest who is one of the user's contacts (in `people`, keyed by the address in lower
 * case) is shown as that person; everyone else as the address.
 */
export function guestRows(
  event: { source: CalendarEvent["source"]; guests?: readonly string[]; organizer?: string },
  people: Readonly<Record<string, GuestPerson>>,
): GuestRow[] {
  const rows: GuestRow[] = [];
  const seen = new Set<string>();
  const add = (raw: string, organizer: boolean) => {
    const address = raw.trim().toLowerCase();
    if (address === "" || seen.has(address)) return;
    seen.add(address);
    rows.push({ address, person: Object.hasOwn(people, address) ? people[address] : null, organizer });
  };
  if (event.source === "outlook" && event.organizer) add(event.organizer, true);
  for (const guest of event.guests ?? []) add(guest, false);
  return rows;
}

/** "2 of 4 to-dos done". */
export function todoProgress(done: number, total: number): string {
  return `${done} of ${total} to-do${total === 1 ? "" : "s"} done`;
}

/** What the panel shows of one of the user's own events, top to bottom; empty parts are left out (null). */
export type OwnPreview = {
  goal: { title: string; color: string } | null;
  title: string;
  when: string;
  /** Part of a series (R28). No repeat rule is stored, so the panel cannot say how often. */
  repeats: boolean;
  guests: GuestRow[];
  todos: { done: number; total: number } | null;
  notes: string | null;
  place: PlaceView;
  /** The user's own events have "Edit". */
  canEdit: true;
};

export function ownPreview(
  event: CalendarEvent,
  goals: readonly { id: string; title: string; color: string }[],
  people: Readonly<Record<string, GuestPerson>>,
  format: TimeFormat,
): OwnPreview {
  const goal = event.goalId ? goals.find((g) => g.id === event.goalId) : undefined;
  const notes = event.notes?.trim() ? event.notes : null;
  return {
    goal: goal ? { title: goal.title, color: goal.color } : null,
    title: event.title,
    when: whenSentence(whenOf(event), format),
    repeats: event.seriesId !== null,
    guests: guestRows(event, people),
    todos: event.todoCount ? { done: event.todosDone ?? 0, total: event.todoCount } : null,
    notes,
    place: placeOf(event.location),
    canEdit: true,
  };
}

/** Whether the panel asks the server where an event's place is (for the map): only for an address. */
export function wantsMap(event: CalendarEvent): boolean {
  return placeOf(event.location).kind === "address";
}
