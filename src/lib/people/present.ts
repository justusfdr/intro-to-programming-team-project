// How a person is presented on the People page's cards and the profile page (spec 53, from spec 33).
// Pure functions, no React: the shown name (display name, else the part of the address before the "@";
// src/lib/profiles/display-name.ts), the first line of the bio, the local time with the time zone's
// city, and what the person shares with the viewer as small marks.
import type { ShareSetting } from "@/lib/shares/types";
import { fmtTime, type TimeFormat } from "@/lib/time/display";
import { localTimeOf } from "@/lib/time/zoned";

export { shownName } from "@/lib/profiles/display-name";

/** How long a bio line on a card may be before it is cut with an ellipsis. */
export const BIO_LINE_MAX = 90;

/** The first line of a bio, cut with "…" when longer than `max` characters; null when there is none. */
export function bioLine(bio: string | null | undefined, max = BIO_LINE_MAX): string | null {
  const first = (bio ?? "").split(/\r\n|\r|\n|\u2028|\u2029/)[0].trim();
  if (first === "") return null;
  const chars = [...first];
  return chars.length <= max ? first : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

/** The city part of a time zone: "Europe/Berlin" → "Berlin", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function cityOf(timeZone: string): string {
  const last = timeZone.split("/").pop() ?? timeZone;
  return last.replaceAll("_", " ");
}

/**
 * "14:20 · Berlin" (24-hour) or "2:20pm · Berlin" (12-hour): the time now where the person is, in the
 * viewer's time format. Null for a time zone the runtime does not know.
 */
export function localTimeLabel(at: Date, timeZone: string, format: TimeFormat): string | null {
  try {
    return `${fmtTime(localTimeOf(at, timeZone), format)} · ${cityOf(timeZone)}`;
  } catch {
    return null;
  }
}

/** One small mark of what a person shares with the viewer. */
export type ShareMark = { kind: "calendar-busy" | "calendar-details"; label: string };

/**
 * What the person shares with the viewer, as marks. Only the calendar: the database's focus flag is not
 * offered by the app and never shown.
 */
export function shareMarks(shared: ShareSetting | null | undefined): ShareMark[] {
  if (!shared) return [];
  const marks: ShareMark[] = [];
  if (shared.calendar === "busy") marks.push({ kind: "calendar-busy", label: "Shares their calendar as free/busy" });
  if (shared.calendar === "details") marks.push({ kind: "calendar-details", label: "Shares their calendar with details" });
  return marks;
}
