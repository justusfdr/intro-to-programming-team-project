import "server-only";

// Data for the goals panel: the signed-in user's goals with their calculated colour and progress.
import { goalProgress, type DoneEvent } from "@/lib/goals/progress";
import type { GoalView } from "@/lib/goals/types";
import type { Deps } from "@/lib/server/deps";
import { readTimeZone } from "@/lib/server/settings";
import { readGoals } from "./rows";

export async function loadGoals(deps: Pick<Deps, "withUser" | "now">, userId: string): Promise<GoalView[]> {
  return deps.withUser(userId, async (query) => {
    const timeZone = await readTimeZone(query);
    const goals = await readGoals(query);
    // Only done events of a goal count (R8).
    const events = await query<{ goal_id: string; start_at: Date; end_at: Date }>(
      // All-day events never count for rules (R29); they cannot be done or have a goal anyway.
      "select goal_id, start_at, end_at from app.events where status = 'done' and goal_id is not null and not all_day",
    );
    const doneByGoal = new Map<string, DoneEvent[]>();
    for (const e of events) {
      const list = doneByGoal.get(e.goal_id) ?? [];
      list.push({ startAt: new Date(e.start_at), endAt: new Date(e.end_at) });
      doneByGoal.set(e.goal_id, list);
    }
    const now = deps.now();
    return goals.map(({ createdAt, goal }, index) => ({
      ...goal,
      colorIndex: index,
      progress: goalProgress(
        { createdAt, deadline: goal.deadline, rules: goal.rules, doneEvents: doneByGoal.get(goal.id) ?? [] },
        now,
        timeZone,
      ),
    }));
  });
}
