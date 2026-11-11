// The shape of a focus session as the server sends it to the page. Times are ISO strings in UTC.
import type { SessionStatus } from "./session-time";

export type SessionDto = {
  id: string;
  eventId: string | null;
  /** The linked event's title, or null for a session without event. */
  eventTitle: string | null;
  plannedMinutes: number;
  status: SessionStatus;
  startedAt: string;
  pausedAt: string | null;
  pausedSeconds: number;
  endedAt: string | null;
  /** 0 to 5, or null when not rated (null is not 0, R14). */
  rating: number | null;
};

/** What the Focus page shows. */
export type FocusData = {
  /** The running or paused session, if any. */
  active: SessionDto | null;
  /** Finished sessions, newest first, each with its focused minutes. */
  recent: (SessionDto & { focusedMinutes: number })[];
  /** The event to focus on, when the page was opened from an event. */
  forEvent: { id: string; title: string; suggestedMinutes: number } | null;
  /** "now" from the server, so the timer starts in step with it. */
  now: string;
};
