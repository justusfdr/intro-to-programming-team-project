// Helpers for event tests: put events straight into the database (bypassing the actions)
// and read them back, so a test can set up a situation and check the result.
import type { TestDb } from "../db/harness";

export type SeedEvent = {
  title?: string;
  start: string; // ISO time, e.g. "2026-11-16T09:00:00Z"
  end: string;
  mayOverlap?: boolean;
  status?: "planned" | "done";
  goalId?: string | null;
};

/** Inserts an event for `userId` as the database owner and returns its id and updated_at. */
export async function seedEvent(db: TestDb, userId: string, event: SeedEvent): Promise<{ id: string; updatedAt: string }> {
  const [row] = await db.admin<{ id: string; updated_at: Date }>(
    `insert into app.events (user_id, title, start_at, end_at, may_overlap, status, goal_id)
     values ($1, $2, $3, $4, $5, $6, $7) returning id, updated_at`,
    [
      userId,
      event.title ?? "Statistics revision",
      event.start,
      event.end,
      event.mayOverlap ?? false,
      event.status ?? "planned",
      event.goalId ?? null,
    ],
  );
  return { id: row.id, updatedAt: new Date(row.updated_at).toISOString() };
}

/** Inserts an all-day event for `userId` as the database owner and returns its id and updated_at. */
export async function seedAllDay(
  db: TestDb,
  userId: string,
  event: { title?: string; firstDay: string; lastDay: string },
): Promise<{ id: string; updatedAt: string }> {
  const [row] = await db.admin<{ id: string; updated_at: Date }>(
    `insert into app.events (user_id, title, all_day, first_day, last_day)
     values ($1, $2, true, $3, $4) returning id, updated_at`,
    [userId, event.title ?? "Exam week", event.firstDay, event.lastDay],
  );
  return { id: row.id, updatedAt: new Date(row.updated_at).toISOString() };
}

type ListedEvent = {
  id: string;
  title: string;
  start_at: Date | null;
  end_at: Date | null;
  all_day: boolean;
  first_day: string | null;
  last_day: string | null;
  series_id: string | null;
  goal_id: string | null;
  status: string;
  updated_at: Date;
};

/** A user's events with times as ISO strings and days as text, in calendar order. */
export async function eventListOf(db: TestDb, userId: string) {
  const rows = await db.admin<ListedEvent>(
    `select id, title, start_at, end_at, all_day, first_day::text as first_day, last_day::text as last_day,
            series_id, goal_id, status, updated_at
       from app.events where user_id = $1 order by coalesce(start_at, first_day::timestamptz), id`,
    [userId],
  );
  const iso = (v: Date | null) => (v ? new Date(v).toISOString() : null);
  return rows.map((r) => ({ ...r, start_at: iso(r.start_at), end_at: iso(r.end_at), updated_at: new Date(r.updated_at).toISOString() }));
}

/** All events of a user as the database holds them, oldest start first. */
export async function eventsOf(db: TestDb, userId: string) {
  return db.admin(
    `select id, title, start_at, end_at, may_overlap, status, source, goal_id, updated_at
       from app.events where user_id = $1 order by start_at, id`,
    [userId],
  );
}
