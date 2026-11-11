import "server-only";

// Action remove_rule (ontology section 5; spec 03). Same pattern as edit_goal:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: find the user's rule ("Not found" otherwise, R3), find its goal, check the goal
//      has not changed since the device last saw it (R4), refuse the last rule of a goal (R7),
//      delete the rule and mark the goal as changed   5. one answer per outcome.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertUnchangedSince } from "@/lib/server/events/own-event";
import { findOwnGoal, findOwnRule, touchGoal } from "@/lib/server/goals/own-goal";
import { readGoals } from "@/lib/server/goals/rows";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

/** The goal's updated_at the device last saw (R4). */
const RemoveRuleBody = z.object({ updatedAt: z.string().max(40) });

export function removeRule(request: Request, deps: Pick<Deps, "auth" | "withUser">, ruleId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, RemoveRuleBody);
    if (!body.ok) return body.response;

    return deps.withUser(userId, async (query) => {
      // Locks the rule until the transaction ends. "Not found" for another user's or a missing rule (R3).
      const rule = await findOwnRule(query, ruleId);
      // Locks the goal too, so a second device waits instead of racing.
      const goal = await findOwnGoal(query, rule.goal_id);
      assertUnchangedSince(goal, body.data.updatedAt);

      const [{ n }] = await query<{ n: number }>("select count(*)::int as n from app.rules where goal_id = $1", [goal.id]);
      if (n === 1) throw new ActionError(409, "last_rule", MESSAGES.lastRule);

      await query("delete from app.rules where id = $1", [rule.id]);
      // Removing a rule changes the goal, so the other devices see a new updated_at (R4).
      await touchGoal(query, goal.id);
      const [saved] = await readGoals(query, goal.id);
      return jsonOk({ message: MESSAGES.ruleRemoved, goal: saved.goal });
    });
  });
}
