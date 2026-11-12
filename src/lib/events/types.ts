// The shape of an event as the server sends it to the page. Times are ISO strings in UTC.

export type EventStatus = "planned" | "done";

export type EventDto = {
  id: string;
  title: string;
  /** R29: an all-day event has a first and last day and no times; a timed event the other way round. */
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  firstDay: string | null;
  lastDay: string | null;
  mayOverlap: boolean;
  status: EventStatus;
  /** The goal the event belongs to, or null. */
  goalId: string | null;
  /** Events of one series share it (R28); null for a single event. */
  seriesId: string | null;
  /** Sent back with every edit and delete, so the server can see whether the row changed since (R4). */
  updatedAt: string;
};

/** A timed event as the week view shows it: the event plus what is calculated for display. */
export type WeekEvent = Omit<EventDto, "startAt" | "endAt"> & {
  allDay: false;
  startAt: string;
  endAt: string;
  /** R10: overlaps another event and either may not overlap. Calculated, never saved. */
  conflict: boolean;
  /** Local start and end time, "09:00". */
  startTime: string;
  endTime: string;
  /** Local day of the end, if it differs from the start's day (an event past midnight). */
  endDay: string | null;
  /** The values for the datetime-local fields of the edit form, in the user's time zone. */
  startLocal: string;
  endLocal: string;
};

/** An all-day event as the week view shows it (R29): on each day from its first to its last day. */
export type AllDayEvent = Omit<EventDto, "startAt" | "endAt" | "firstDay" | "lastDay"> & {
  allDay: true;
  firstDay: string;
  lastDay: string;
};

/** Any event the calendar can open in the editor. */
export type CalendarEvent = WeekEvent | AllDayEvent;

/** A day of the week: its timed events (by start, R2) and the all-day events covering it. */
export type WeekDay = { date: string; label: string; isToday: boolean; events: WeekEvent[]; allDay: AllDayEvent[] };

export type WeekData = {
  timeZone: string;
  monday: string;
  previous: string;
  next: string;
  /** The Monday of the current week (for "This week"). */
  thisWeek: string;
  days: WeekDay[];
};
