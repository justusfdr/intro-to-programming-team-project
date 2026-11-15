// What a user shares with a contact, and what the server hands out of a shared calendar or focus chart
// (spec 29, ontology R47 to R51). Only these shapes ever leave another user's rows.
import type { AvatarLook } from "@/lib/profiles/types";

/** How much of the calendar a contact sees: nothing, blocks without text, or title, time and place. */
export type CalendarLevel = "none" | "busy" | "details";
export const CALENDAR_LEVELS: readonly CalendarLevel[] = ["none", "busy", "details"];

/** What one person shares with another. No row in the database means NOTHING_SHARED. */
export type ShareSetting = { calendar: CalendarLevel; focus: boolean };
export const NOTHING_SHARED: ShareSetting = { calendar: "none", focus: false };

/** Per contact row: what I share with them ("out") and what they share with me ("in"). */
export type ContactShares = { contactId: string; userId: string; out: ShareSetting; in: ShareSetting };

/** A contact who shares something with me, with what the calendar and analytics pages need to show them. */
export type SharingPerson = {
  userId: string;
  name: string;
  photoUrl: string | null;
  /** Their calendar's level for me ("none": they do not share it). */
  calendar: CalendarLevel;
  focus: boolean;
  /** Only for a demo contact (spec 32): their initials and colour. Real people never have this key. */
  demo?: AvatarLook;
};

/** At most this many shared calendars are shown at once (R51). */
export const MAX_SHOWN_CALENDARS = 3;
/** The longest window one request for a shared calendar may cover (R48). */
export const MAX_WINDOW_DAYS = 62;

/**
 * One event of a shared calendar (R48). Timed: start and end; all-day: first and last day. Title and
 * place only at "details" (left out at "busy"). Nothing else, never an id.
 */
export type SharedTimed = { allDay: false; startAt: string; endAt: string; title?: string; location?: string | null };
export type SharedAllDay = { allDay: true; firstDay: string; lastDay: string; title?: string; location?: string | null };
export type SharedEvent = SharedTimed | SharedAllDay;

/** The answer of GET /api/shares/[userId]/calendar. */
export type SharedCalendarAnswer = { level: "busy" | "details"; events: SharedEvent[] };

/** The keys an answer may have, at most. The tests fail when another appears. */
export const SHARED_CALENDAR_KEYS = ["level", "events"] as const;
export const SHARED_EVENT_KEYS = ["allDay", "startAt", "endAt", "firstDay", "lastDay", "title", "location"] as const;

/** One bar of a shared focus chart (R49): focused minutes and finished sessions. */
export type FocusBar = { focusedMinutes: number; sessions: number };
/** The answer of GET /api/shares/[userId]/focus: 8 weeks (oldest first, by their Monday) and this week's 7 days. */
export type SharedFocusAnswer = {
  weeks: (FocusBar & { monday: string })[];
  days: (FocusBar & { date: string })[];
};
export const SHARED_FOCUS_KEYS = ["weeks", "days"] as const;
export const FOCUS_WEEK_KEYS = ["monday", "focusedMinutes", "sessions"] as const;
export const FOCUS_DAY_KEYS = ["date", "focusedMinutes", "sessions"] as const;

/** "Free/busy" for the screen. */
export function levelText(level: CalendarLevel): string {
  return level === "busy" ? "free/busy" : level === "details" ? "details" : "off";
}

/** "Shares their calendar (details) and focus chart with you", or null when they share nothing. */
export function sharedWithYouText(setting: ShareSetting): string | null {
  const parts: string[] = [];
  if (setting.calendar !== "none") parts.push(`their calendar (${levelText(setting.calendar)})`);
  if (setting.focus) parts.push(parts.length ? "focus chart" : "their focus chart");
  if (parts.length === 0) return null;
  return `Shares ${parts.join(" and ")} with you`;
}
