import "server-only";

// Data for the Analytics page (R19, R20): the user's finished sessions and blocked attempts of one
// week, turned into numbers by the pure functions in src/lib/analytics/score.ts. Nothing is saved.
import { weekAnalytics, type Attempt, type FinishedSession } from "@/lib/analytics/score";
import type { AnalyticsData } from "@/lib/analytics/types";
import { focusedMinutes } from "@/lib/focus/session-time";
import type { Deps } from "@/lib/server/deps";
import { settleSessions, timesOf, type SessionRow } from "@/lib/server/focus/sessions";
import { readTimeZone } from "@/lib/server/settings";
import { addDays, isLocalDate, localDateOf, mondayOf, weekOf } from "@/lib/time/zoned";

export async function loadAnalytics(deps: Pick<Deps, "withUser" | "now">, userId: string, requested?: string): Promise<AnalyticsData> {
  const now = deps.now();
  // A session that reached its planned length finishes first, so it counts (R13).
  await settleSessions(deps, userId, now);
  return deps.withUser(userId, async (query) => {
    const timeZone = await readTimeZone(query);
    const today = localDateOf(now, timeZone);
    const week = weekOf(requested && isLocalDate(requested) ? requested : today, timeZone);

    // Finished sessions that started this week (a session belongs to the day it starts).
    const rows = await query<SessionRow>(
      `select id, null as event_id, null as event_title, planned_minutes, status, started_at, paused_at, paused_seconds, ended_at, rating
         from app.focus_sessions
        where status = 'finished' and started_at >= $1 and started_at < $2`,
      [week.startsAt, week.endsAt],
    );
    const sessions: FinishedSession[] = rows.map((row) => ({
      startedAt: new Date(row.started_at),
      endedAt: new Date(row.ended_at!),
      plannedMinutes: row.planned_minutes,
      focusedMinutes: focusedMinutes(timesOf(row), now),
    }));

    // Attempts of the week, and those after it that still lie inside one of this week's sessions.
    const latestEnd = sessions.reduce((latest, s) => (s.endedAt > latest ? s.endedAt : latest), week.endsAt);
    const attemptRows = await query<{ domain: string; attempted_at: Date }>(
      "select domain, attempted_at from app.blocked_attempts where attempted_at >= $1 and attempted_at <= $2",
      [week.startsAt, latestEnd],
    );
    const attempts: Attempt[] = attemptRows.map((a) => ({ domain: a.domain, attemptedAt: new Date(a.attempted_at) }));

    return {
      timeZone,
      monday: week.monday,
      previous: addDays(week.monday, -7),
      next: addDays(week.monday, 7),
      thisWeek: mondayOf(today),
      today: week.days.includes(today) ? today : null,
      analytics: weekAnalytics(sessions, attempts, week.monday, timeZone),
    };
  });
}
