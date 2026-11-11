// The arithmetic of a focus session (R12, R13, R14). Pure functions, no database and no React;
// the server and the Focus page use the same ones.
//
// R13: focused time = end − start − paused time, rounded down to whole minutes. A running session
// ends by itself at start + planned minutes + paused time. A paused session stays paused.

/** R12: the only lengths, in minutes. */
export const SESSION_LENGTHS = [15, 30, 60, 90, 120] as const;
export type SessionLength = (typeof SESSION_LENGTHS)[number];

export type SessionStatus = "running" | "paused" | "finished";

export type SessionTimes = {
  status: SessionStatus;
  plannedMinutes: number;
  startedAt: Date;
  /** Set while paused. */
  pausedAt: Date | null;
  /** Seconds of the pauses already resumed. */
  pausedSeconds: number;
  /** Set when finished. */
  endedAt: Date | null;
};

export function isSessionLength(value: unknown): value is SessionLength {
  return typeof value === "number" && (SESSION_LENGTHS as readonly number[]).includes(value);
}

/** When a running session ends by itself: start + planned minutes + paused time (R13). */
export function plannedEnd(session: Pick<SessionTimes, "startedAt" | "plannedMinutes" | "pausedSeconds">): Date {
  return new Date(session.startedAt.getTime() + (session.plannedMinutes * 60 + session.pausedSeconds) * 1000);
}

/** Seconds of focus so far: up to now (running), up to the pause (paused) or up to the end (finished). */
export function focusedSeconds(session: SessionTimes, now: Date): number {
  const until =
    session.status === "finished" ? session.endedAt! : session.status === "paused" ? session.pausedAt! : now;
  return Math.max(0, Math.floor((until.getTime() - session.startedAt.getTime()) / 1000) - session.pausedSeconds);
}

/** R13: focused minutes, rounded down. */
export function focusedMinutes(session: SessionTimes, now: Date): number {
  return Math.floor(focusedSeconds(session, now) / 60);
}

/** Seconds left until the planned length is reached (0 once it is). */
export function secondsLeft(session: SessionTimes, now: Date): number {
  return Math.max(0, session.plannedMinutes * 60 - focusedSeconds(session, now));
}

/** The paused seconds after resuming a session paused since `pausedAt`. */
export function pausedSecondsAfterResume(session: Pick<SessionTimes, "pausedAt" | "pausedSeconds">, now: Date): number {
  if (!session.pausedAt) return session.pausedSeconds;
  return session.pausedSeconds + Math.max(0, Math.floor((now.getTime() - session.pausedAt.getTime()) / 1000));
}

/** The length to suggest for an event: the shortest one that covers it, at most 120 minutes. */
export function lengthForEvent(minutes: number): SessionLength {
  return SESSION_LENGTHS.find((length) => length >= minutes) ?? 120;
}

/** "45 min" or "1 h 30 min". */
export function minutesText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "24:59" or "1:05:00" for a timer. */
export function clockText(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
