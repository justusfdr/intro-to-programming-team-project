import "server-only";

// Reading and finding focus sessions, shared by the session actions and the Focus page.
import type { SessionDto } from "@/lib/focus/types";
import type { Query } from "@/lib/server/db";
import { notFound } from "@/lib/server/events/own-event";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The columns every session read selects (with the linked event's title, if any). */
export const SESSION_COLUMNS = `s.id, s.event_id, e.title as event_title, s.planned_minutes, s.status, s.started_at,
  s.paused_at, s.paused_seconds, s.ended_at, s.rating`;
export const SESSION_FROM = "app.focus_sessions s left join app.events e on e.id = s.event_id";

export type SessionRow = {
  id: string;
  event_id: string | null;
  event_title: string | null;
  planned_minutes: number;
  status: "running" | "paused" | "finished";
  started_at: Date;
  paused_at: Date | null;
  paused_seconds: number;
  ended_at: Date | null;
  rating: number | null;
};

const iso = (value: Date | null) => (value ? new Date(value).toISOString() : null);

export function toSessionDto(row: SessionRow): SessionDto {
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    plannedMinutes: row.planned_minutes,
    status: row.status,
    startedAt: new Date(row.started_at).toISOString(),
    pausedAt: iso(row.paused_at),
    pausedSeconds: row.paused_seconds,
    endedAt: iso(row.ended_at),
    rating: row.rating,
  };
}

/**
 * R13: every running session of the user whose planned end has passed becomes finished, with
 * ended_at = start + planned minutes + paused time. Call it at the start of every session action
 * and before showing sessions, so a session finishes "by itself" even with the browser closed.
 */
export async function finishDueSessions(query: Query, now: Date): Promise<void> {
  await query(
    `update app.focus_sessions
        set status = 'finished',
            ended_at = started_at + make_interval(mins => planned_minutes, secs => paused_seconds)
      where status = 'running'
        and started_at + make_interval(mins => planned_minutes, secs => paused_seconds) <= $1`,
    [now],
  );
}

/** The user's session with this id, locked until the transaction ends. "Not found" otherwise (R3). */
export async function findOwnSession(query: Query, id: string): Promise<SessionRow> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await query<SessionRow>(`select ${SESSION_COLUMNS} from ${SESSION_FROM} where s.id = $1 for update of s`, [id]);
  if (!row) throw notFound();
  return row;
}

/** The user's running or paused session, or null. */
export async function activeSession(query: Query): Promise<SessionRow | null> {
  const [row] = await query<SessionRow>(
    `select ${SESSION_COLUMNS} from ${SESSION_FROM} where s.status in ('running', 'paused')`,
  );
  return row ?? null;
}

/** The session times as the pure functions in src/lib/focus/session-time.ts take them. */
export function timesOf(row: SessionRow) {
  return {
    status: row.status,
    plannedMinutes: row.planned_minutes,
    startedAt: new Date(row.started_at),
    pausedAt: row.paused_at ? new Date(row.paused_at) : null,
    pausedSeconds: row.paused_seconds,
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
  };
}
