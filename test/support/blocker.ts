// Helpers for blocker tests.
import type { TestDb } from "../db/harness";

/** A user's block list as the database holds it, sorted by domain. */
export async function sitesOf(db: TestDb, userId: string): Promise<string[]> {
  const rows = await db.admin<{ domain: string }>("select domain from app.blocked_sites where user_id = $1 order by domain", [userId]);
  return rows.map((r) => r.domain);
}

/** A user's stored attempts, oldest first, times as ISO strings. */
export async function attemptsOf(db: TestDb, userId: string) {
  const rows = await db.admin<{ domain: string; attempted_at: Date }>(
    "select domain, attempted_at from app.blocked_attempts where user_id = $1 order by attempted_at, domain",
    [userId],
  );
  return rows.map((r) => ({ domain: r.domain, attemptedAt: new Date(r.attempted_at).toISOString() }));
}

export const DEFAULT_SITES = ["facebook.com", "instagram.com", "reddit.com", "tiktok.com", "x.com", "youtube.com"];
