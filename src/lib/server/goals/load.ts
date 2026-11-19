import "server-only";

// Data for the goals panel: the signed-in user's goals with their look (saved or calculated colour) and calculated progress.
import { goalProgress, type DoneEvent } from "@/lib/goals/progress";
import { lookOf } from "@/lib/goals/style";
import type { GoalView } from "@/lib/goals/types";
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { readTimeZone } from "@/lib/server/settings";
import { readInvitedGoalEvents, startingBetween } from "./invited";
import { readGoals } from "./rows";

export async function loadGoals(deps: Pick<Deps, "withUser" | "now">, userId: string): Promise<GoalView[]> {
  return deps.withUser(userId, (query) => readGoalViews(query, deps.now(), readTimeZone(query)));
}

/** The same inside a transaction that is already open; the time zone may still be on its way. */
export async function readGoalViews(query: Query, now: Date, timeZoneRead: string | Promise<string>): Promise<GoalView[]> {
  // Planned events near this week, for the days row (R9): a missed or a planned day.
  const from = new Date(now.getTime() - 8 * 24 * 3_600_000);
  const to = new Date(now.getTime() + 8 * 24 * 3_600_000);
  const [goals, events, planned, invited, timeZone] = await Promise.all([
    readGoals(query),
    // Only done events of a goal count (R8).
    // All-day events never count for rules (R29); they cannot be done or have a goal anyway.
    query<{ goal_id: string; start_at: Date; end_at: Date }>(
      "select goal_id, start_at, end_at from app.events where status = 'done' and goal_id is not null and not all_day",
    ),
    // Without parameters on purpose: a statement with parameters makes the driver send the later ones
    // one by one (src/lib/server/db/index.ts). The two times come from our own clock, as ISO text.
    query<{ goal_id: string; start_at: Date }>(
      `select goal_id, start_at from app.events where status = 'planned' and goal_id is not null and not all_day and start_at >= '${from.toISOString()}'::timestamptz and start_at < '${to.toISOString()}'::timestamptz`,
    ),
    // Spec 55 (R66): accepted invitations the user gave one of their goals count like own events.
    readInvitedGoalEvents(query),
    timeZoneRead,
  ]);
  const plannedByGoal = new Map<string, { startAt: Date }[]>();
  for (const e of planned) {
    plannedByGoal.set(e.goal_id, [...(plannedByGoal.get(e.goal_id) ?? []), { startAt: new Date(e.start_at) }]);
  }
  for (const e of startingBetween(invited, from, to)) {
    if (e.status === "planned") plannedByGoal.set(e.goalId, [...(plannedByGoal.get(e.goalId) ?? []), { startAt: e.startAt }]);
  }
  const doneByGoal = new Map<string, DoneEvent[]>();
  for (const e of events) {
    const list = doneByGoal.get(e.goal_id) ?? [];
    list.push({ startAt: new Date(e.start_at), endAt: new Date(e.end_at) });
    doneByGoal.set(e.goal_id, list);
  }
  for (const e of invited) {
    if (e.status === "done") doneByGoal.set(e.goalId, [...(doneByGoal.get(e.goalId) ?? []), { startAt: e.startAt, endAt: e.endAt }]);
  }
  return goals.map(({ createdAt, goal }, index) => ({
    ...goal,
    colorIndex: index,
    look: lookOf(goal, index),
    progress: goalProgress(
      { createdAt, deadline: goal.deadline, rules: goal.rules, doneEvents: doneByGoal.get(goal.id) ?? [], plannedEvents: plannedByGoal.get(goal.id) ?? [] },
      now,
      timeZone,
    ),
  }));
}
