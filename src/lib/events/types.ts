// The shape of an event as the server sends it to the page. Times are ISO strings in UTC.

export type EventStatus = "planned" | "done";

export type EventDto = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  mayOverlap: boolean;
  status: EventStatus;
  /** The goal the event belongs to, or null. */
  goalId: string | null;
  /** Sent back with every edit and delete, so the server can see whether the row changed since (R4). */
  updatedAt: string;
};

/** An event as the week view shows it: the event plus what is calculated for display. */
export type WeekEvent = EventDto & {
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

export type WeekDay = { date: string; label: string; isToday: boolean; events: WeekEvent[] };

export type WeekData = {
  timeZone: string;
  monday: string;
  previous: string;
  next: string;
  /** The Monday of the current week (for "This week"). */
  thisWeek: string;
  days: WeekDay[];
};
