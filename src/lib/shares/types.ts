// What a user shares with a contact, and what the server hands out of a shared calendar (spec 53, from
// spec 29; ontology R55 to R58). Only these shapes ever leave another user's rows.
// The database also stores a "focus" flag per share (the focus chart of spec 29). The app does not offer
// it: it never shows it and always sends the stored value back unchanged (src/components/people/ShareRow.tsx).

/** How much of the calendar a contact sees: nothing, blocks without text, or title, time and place. */
export type CalendarLevel = "none" | "busy" | "details";
export const CALENDAR_LEVELS: readonly CalendarLevel[] = ["none", "busy", "details"];

/** What one person shares with another. No row in the database means NOTHING_SHARED. */
export type ShareSetting = { calendar: CalendarLevel; focus: boolean };
export const NOTHING_SHARED: ShareSetting = { calendar: "none", focus: false };

/** Per contact row: what I share with them ("out") and what they share with me ("in"). */
export type ContactShares = { contactId: string; userId: string; out: ShareSetting; in: ShareSetting };

/**
 * How the user stands with the person on their profile page: the contact row (for set_share and
 * removing), what the user shares with them ("out"), and what they share with the user. A person who is
 * not a contact (their invitation is open) has none.
 */
export type PersonRelation = { contactId: string; out: ShareSetting; shared: ShareSetting };

/** A contact who shares their calendar with me, with what the calendar page needs to show them. */
export type SharingPerson = {
  userId: string;
  name: string;
  photoUrl: string | null;
  /** Their calendar's level for me ("none": they do not share it). */
  calendar: CalendarLevel;
  focus: boolean;
};

/** At most this many shared calendars are shown at once (R58). */
export const MAX_SHOWN_CALENDARS = 3;
/** The longest window one request for a shared calendar may cover (R56). */
export const MAX_WINDOW_DAYS = 62;

/**
 * One event of a shared calendar (R56). Timed: start and end; all-day: first and last day. Title and
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

/** "Free/busy" for the screen. */
export function levelText(level: CalendarLevel): string {
  return level === "busy" ? "free/busy" : level === "details" ? "details" : "off";
}

/** "Shares their calendar (details) with you", or null when they do not share it. */
export function sharedWithYouText(setting: ShareSetting): string | null {
  if (setting.calendar === "none") return null;
  return `Shares their calendar (${levelText(setting.calendar)}) with you`;
}
