// Helpers for event tests: put events straight into the database (bypassing the actions)
// and read them back, so a test can set up a situation and check the result.
import type { TestDb } from "../db/harness";

export type SeedEvent = {
  title?: string;
  start: string; // ISO time, e.g. "2026-11-16T09:00:00Z"
  end: string;
  mayOverlap?: boolean;
  status?: "planned" | "done";
};

/** Inserts an event for `userId` as the database owner and returns its id and updated_at. */
export async function seedEvent(db: TestDb, userId: string, event: SeedEvent): Promise<{ id: string; updatedAt: string }> {
  const [row] = await db.admin<{ id: string; updated_at: Date }>(
    `insert into app.events (user_id, title, start_at, end_at, may_overlap, status)
     values ($1, $2, $3, $4, $5, $6) returning id, updated_at`,
    [userId, event.title ?? "Statistics revision", event.start, event.end, event.mayOverlap ?? false, event.status ?? "planned"],
  );
  return { id: row.id, updatedAt: new Date(row.updated_at).toISOString() };
}

/** All events of a user as the database holds them, oldest start first. */
export async function eventsOf(db: TestDb, userId: string) {
  return db.admin(
    `select id, title, start_at, end_at, may_overlap, status, source, updated_at
       from app.events where user_id = $1 order by start_at, id`,
    [userId],
  );
}
