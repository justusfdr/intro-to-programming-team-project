import "server-only";

// Data for a report over several weeks (spec 49, "Export"): reads the user's own rows of the period
// (and of as many weeks before it, for the comparison) inside the transaction that is already open
// (row-level security keeps it to the signed-in user, R3), then lets the pure functions in
// src/lib/analytics/period-build.ts add everything up. Nothing is saved.
import { buildPeriod } from "@/lib/analytics/period-build";
import type { Period, PeriodReport } from "@/lib/analytics/period";
import type { ReportEvent, ReportGoal, ReportSession } from "@/lib/analytics/report";
import type { Attempt } from "@/lib/analytics/score";
import { focusedMinutes } from "@/lib/focus/session-time";
import { lookOf } from "@/lib/goals/style";
import type { Query } from "@/lib/server/db";
import { timesOf, type SessionRow } from "@/lib/server/focus/sessions";
import { readInvitedGoalEvents, startingBetween } from "@/lib/server/goals/invited";
import { readGoals } from "@/lib/server/goals/rows";
import { addDays, startOfLocalDate } from "@/lib/time/zoned";

/** The report of `period`; call settleSessions before it, so a session that just ran out counts (R13). */
export async function readPeriodReport(query: Query, now: Date, period: Period, timeZone: string): Promise<PeriodReport> {
  const start = startOfLocalDate(period.from, timeZone);
  const end = startOfLocalDate(addDays(period.to, 7), timeZone);
  // The same number of weeks right before the period, for "more than before".
  const beforeStart = startOfLocalDate(addDays(period.from, -7 * period.weeks), timeZone);

  const [sessionRows, attemptRows, eventRows, goalRows, invitedRows] = await Promise.all([
    // Finished sessions with the goal of their event (a deleted event or goal leaves null).
    query<SessionRow & { goal_title: string | null }>(
      `select s.id, s.event_id, null as event_title, e.goal_id as event_goal_id, g.title as goal_title, s.planned_minutes, s.status,
              s.started_at, s.paused_at, s.paused_seconds, s.ended_at, s.rating
         from app.focus_sessions s
         left join app.events e on e.id = s.event_id
         left join app.goals g on g.id = e.goal_id
        where s.status = 'finished' and s.started_at >= $1 and s.started_at < $2`,
      [beforeStart, end],
    ),
    // Visits of those days, and the ones after them that still lie inside a session that started in them.
    query<{ domain: string; attempted_at: Date }>(
      `select domain, attempted_at from app.blocked_attempts
        where attempted_at >= $1
          and (attempted_at < $2
               or attempted_at <= (select max(ended_at) from app.focus_sessions where status = 'finished' and started_at >= $1 and started_at < $2))`,
      [beforeStart, end],
    ),
    // Timed events that start in the period.
    query<{ id: string; title: string; goal_id: string | null; start_at: Date; end_at: Date; status: "planned" | "done" }>(
      "select id, title, goal_id, start_at, end_at, status from app.events where not all_day and start_at >= $1 and start_at < $2",
      [start, end],
    ),
    readGoals(query),
    // Spec 55 (R66): accepted invitations the user gave one of their goals, as the goal's events.
    readInvitedGoalEvents(query),
  ]);

  const sessions: ReportSession[] = sessionRows.map((row) => ({
    startedAt: new Date(row.started_at),
    endedAt: new Date(row.ended_at!),
    plannedMinutes: row.planned_minutes,
    focusedMinutes: focusedMinutes(timesOf(row), now),
    goalId: row.event_goal_id,
    goalTitle: row.goal_title,
  }));
  const attempts: Attempt[] = attemptRows.map((a) => ({ domain: a.domain, attemptedAt: new Date(a.attempted_at) }));
  const events: ReportEvent[] = eventRows.map((e) => ({ id: e.id, title: e.title, goalId: e.goal_id, startAt: new Date(e.start_at), endAt: new Date(e.end_at), status: e.status }));
  for (const e of startingBetween(invitedRows, start, end)) events.push({ id: e.id, title: e.title, goalId: e.goalId, startAt: e.startAt, endAt: e.endAt, status: e.status });
  // A goal without a colour gets the one calculated from its place in the list, as everywhere (R35).
  const goals: ReportGoal[] = goalRows.map(({ goal, createdAt }, index) => ({
    id: goal.id,
    title: goal.title,
    ...lookOf(goal, index),
    deadline: goal.deadline,
    createdAt,
    rules: goal.rules.map((r) => ({ id: r.id, kind: r.kind, target: r.target, minMinutes: r.minMinutes })),
  }));

  return buildPeriod({ sessions, attempts, events, goals, now, timeZone, period });
}
