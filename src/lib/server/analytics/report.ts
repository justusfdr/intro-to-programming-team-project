import "server-only";

// Data for the Analytics page of spec 49: reads what the numbers need inside the transaction that
// is already open (row-level security keeps it to the signed-in user, R3), then lets the pure
// functions in src/lib/analytics work everything out. Nothing is saved.
import { insightsOf } from "@/lib/analytics/insights";
import { buildReport, HEAT_DAYS, notMetWeeks, type ReportEvent, type ReportGoal, type ReportSession } from "@/lib/analytics/report";
import type { AnalyticsReport } from "@/lib/analytics/report-types";
import type { Attempt } from "@/lib/analytics/score";
import { focusedMinutes } from "@/lib/focus/session-time";
import { lookOf } from "@/lib/goals/style";
import type { Query } from "@/lib/server/db";
import { readInvitedGoalEvents, startingBetween } from "@/lib/server/goals/invited";
import { readGoals } from "@/lib/server/goals/rows";
import { timesOf, type SessionRow } from "@/lib/server/focus/sessions";
import { addDays, isLocalDate, localDateOf, startOfLocalDate, weekOf } from "@/lib/time/zoned";

/** The report of the shown week; call settleSessions before it, as for readAnalytics. */
export async function readAnalyticsReport(
  query: Query,
  now: Date,
  requestedWeek: string | undefined,
  timeZoneRead: string | Promise<string>,
  /**
   * The goals read, when the caller has already started it. The page starts it first: the goal read
   * has no parameters, and the driver only sends such a read together with the others when it goes first (db/with-user.ts).
   */
  goalsRead: ReturnType<typeof readGoals> = readGoals(query),
): Promise<AnalyticsReport> {
  const timeZone = await timeZoneRead;
  const today = localDateOf(now, timeZone);
  const week = weekOf(requestedWeek && isLocalDate(requestedWeek) ? requestedWeek : today, timeZone);

  // Sessions and the heat map reach 12 weeks back, and so does a goal's row of weeks (12 weeks as well).
  const from = startOfLocalDate(addDays(week.monday, 7 - HEAT_DAYS), timeZone);
  const lastWeekStart = startOfLocalDate(addDays(week.monday, -7), timeZone);

  const [sessionRows, attemptRows, eventRows, goalRows, invitedRows] = await Promise.all([
    // Finished sessions with the goal of their event (a deleted event or goal leaves null).
    query<SessionRow & { goal_title: string | null }>(
      `select s.id, s.event_id, null as event_title, e.goal_id as event_goal_id, g.title as goal_title, s.planned_minutes, s.status,
              s.started_at, s.paused_at, s.paused_seconds, s.ended_at, s.rating
         from app.focus_sessions s
         left join app.events e on e.id = s.event_id
         left join app.goals g on g.id = e.goal_id
        where s.status = 'finished' and s.started_at >= $1 and s.started_at < $2`,
      [from, week.endsAt],
    ),
    // Visits of those days, and the ones after them that still lie inside a session that started in them.
    query<{ domain: string; attempted_at: Date }>(
      `select domain, attempted_at from app.blocked_attempts
        where attempted_at >= $1
          and (attempted_at < $2
               or attempted_at <= (select max(ended_at) from app.focus_sessions where status = 'finished' and started_at >= $1 and started_at < $2))`,
      [from, week.endsAt],
    ),
    // Timed events: every one of the shown and the last week, and those of a goal back to the first week.
    query<{ id: string; title: string; goal_id: string | null; start_at: Date; end_at: Date; status: "planned" | "done" }>(
      `select id, title, goal_id, start_at, end_at, status from app.events
        where not all_day and start_at >= $1 and start_at < $2 and (goal_id is not null or start_at >= $3)`,
      [from, week.endsAt, lastWeekStart],
    ),
    goalsRead,
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
  const events: ReportEvent[] = eventRows.map((e) => ({
    id: e.id,
    title: e.title,
    goalId: e.goal_id,
    startAt: new Date(e.start_at),
    endAt: new Date(e.end_at),
    status: e.status,
  }));
  for (const e of startingBetween(invitedRows, from, week.endsAt)) events.push({ id: e.id, title: e.title, goalId: e.goalId, startAt: e.startAt, endAt: e.endAt, status: e.status });
  // A goal without a colour gets the one calculated from its place in the list, as everywhere (R35).
  const goals: ReportGoal[] = goalRows.map(({ goal, createdAt }, index) => ({
    id: goal.id,
    title: goal.title,
    ...lookOf(goal, index),
    deadline: goal.deadline,
    createdAt,
    rules: goal.rules.map((r) => ({ id: r.id, kind: r.kind, target: r.target, minMinutes: r.minMinutes })),
  }));

  const input = { sessions, attempts, events, goals, now, monday: week.monday, timeZone };
  const parts = buildReport(input);
  return { ...parts, ...insightsOf(parts, { notMetWeeks: notMetWeeks(input) }) };
}
