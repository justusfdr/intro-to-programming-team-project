import "server-only";

// The blocker's data, read inside withUser: the block list, whether blocking is on and until when
// (R15), and whether the extension asked in the last 2 minutes (R18).
import { blockingState } from "@/lib/blocker/state";
import type { BlockedSite } from "@/lib/blocker/types";
import { plannedEnd } from "@/lib/focus/session-time";
import type { Query } from "@/lib/server/db";


/** The user's block list, oldest first (the six defaults come first for a new account). */
export async function readBlockedSites(query: Query): Promise<BlockedSite[]> {
  return query<BlockedSite>("select id, domain from app.blocked_sites order by created_at, domain");
}

/** R15 at `now`. Call settleSessions first, so an overdue session no longer counts as running. */
export async function readBlockingState(query: Query, now: Date) {
  const [running] = await query<{ started_at: Date; planned_minutes: number; paused_seconds: number }>(
    "select started_at, planned_minutes, paused_seconds from app.focus_sessions where status = 'running'",
  );
  // Events last at most 24 hours, so only those starting in the last day can be in progress.
  const events = await query<{ start_at: Date; end_at: Date }>(
    `select e.start_at, e.end_at
       from app.events e join app.goals g on g.id = e.goal_id
      where g.auto_block and not e.all_day and e.start_at <= $1 and e.end_at > $1 and e.start_at > $1::timestamptz - interval '24 hours'`,
    [now],
  );
  return blockingState({
    now,
    runningSessionEnd: running
      ? plannedEnd({ startedAt: new Date(running.started_at), plannedMinutes: running.planned_minutes, pausedSeconds: running.paused_seconds })
      : null,
    autoBlockEvents: events.map((e) => ({ startAt: new Date(e.start_at), endAt: new Date(e.end_at) })),
  });
}

/** R18: true when the extension asked in the last 2 minutes (both times from the database's clock). */
export async function readExtensionConnected(query: Query): Promise<boolean> {
  const [row] = await query<{ connected: boolean }>(
    "select coalesce(extension_seen_at > now() - interval '2 minutes', false) as connected from app.profiles",
  );
  return row?.connected ?? false;
}
