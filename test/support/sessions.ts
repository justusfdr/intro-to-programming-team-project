// Helpers for focus session tests: put sessions straight into the database (bypassing the actions)
// and read them back.
import type { TestDb } from "../db/harness";

export type SeedSession = {
  plannedMinutes?: number;
  status?: "running" | "paused" | "finished";
  startedAt: string; // ISO, e.g. "2026-11-16T09:00:00Z"
  pausedAt?: string | null;
  pausedSeconds?: number;
  endedAt?: string | null;
  rating?: number | null;
  eventId?: string | null;
};

/** Inserts a session for `userId` as the database owner and returns its id. */
export async function seedSession(db: TestDb, userId: string, s: SeedSession): Promise<string> {
  const [row] = await db.admin<{ id: string }>(
    `insert into app.focus_sessions (user_id, event_id, planned_minutes, status, started_at, paused_at, paused_seconds, ended_at, rating)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      userId,
      s.eventId ?? null,
      s.plannedMinutes ?? 60,
      s.status ?? "running",
      s.startedAt,
      s.pausedAt ?? null,
      s.pausedSeconds ?? 0,
      s.endedAt ?? null,
      s.rating ?? null,
    ],
  );
  return row.id;
}

/** A user's sessions as the database holds them, oldest first, times as ISO strings. */
export async function sessionsOf(db: TestDb, userId: string) {
  type Row = {
    id: string;
    event_id: string | null;
    planned_minutes: number;
    status: string;
    started_at: Date;
    paused_at: Date | null;
    paused_seconds: number;
    ended_at: Date | null;
    rating: number | null;
  };
  const rows = await db.admin<Row>(
    `select id, event_id, planned_minutes, status, started_at, paused_at, paused_seconds, ended_at, rating
       from app.focus_sessions where user_id = $1 order by started_at, id`,
    [userId],
  );
  const iso = (v: Date | null) => (v ? new Date(v).toISOString() : null);
  return rows.map((r) => ({ ...r, started_at: iso(r.started_at), paused_at: iso(r.paused_at), ended_at: iso(r.ended_at) }));
}
