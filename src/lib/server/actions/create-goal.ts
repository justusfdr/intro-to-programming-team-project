import "server-only";

// Action create_goal (ontology section 5; spec 03). Same pattern as create_event:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: check the rules (the deadline against today in the user's time zone),
//      write the goal and its rules   5. one answer per outcome.
// Goal and rules are written in one transaction, so they are saved together or not at all (R1);
// the database also refuses a goal without a rule when the transaction ends.
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { checkGoalFields, GoalFields } from "@/lib/server/goals/input";
import { readGoals } from "@/lib/server/goals/rows";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { localDateOf } from "@/lib/time/zoned";

export function createGoal(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, GoalFields);
    if (!body.ok) return body.response;

    return deps.withUser(userId, async (query) => {
      const today = localDateOf(deps.now(), await readTimeZone(query));
      // A new goal has no rule ids yet; ids sent along are ignored.
      const goal = checkGoalFields(body.data, today);

      // user_id, created_at and updated_at are filled in by the database.
      const [{ id }] = await query<{ id: string }>(
        "insert into app.goals (title, deadline, auto_block) values ($1, $2, $3) returning id",
        [goal.title, goal.deadline, goal.autoBlock],
      );
      for (const rule of goal.rules) {
        await query("insert into app.rules (goal_id, kind, target, min_minutes) values ($1, $2, $3, $4)", [
          id,
          rule.kind,
          rule.target,
          rule.minMinutes,
        ]);
      }
      const [saved] = await readGoals(query, id);
      return jsonOk({ message: MESSAGES.goalSaved, goal: saved.goal }, 201);
    });
  });
}
