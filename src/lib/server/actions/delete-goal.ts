import "server-only";

// Action delete_goal (ontology section 5; spec 03). Same pattern as delete_event:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: find the user's goal ("Not found" otherwise, R3), check it has not changed
//      since the device last saw it (R4), delete it; the database deletes its rules and leaves
//      its events without goal   5. one answer per outcome.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertUnchangedSince } from "@/lib/server/events/own-event";
import { findOwnGoal } from "@/lib/server/goals/own-goal";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

/** The goal's updatedAt the device last saw (R4). */
const DeleteGoalBody = z.object({ updatedAt: z.string().max(40) });

export function deleteGoal(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, DeleteGoalBody);
    if (!body.ok) return body.response;

    return deps.withUser(userId, async (query) => {
      // Locks the goal until the transaction ends, so a second device waits instead of racing.
      const goal = await findOwnGoal(query, id);
      assertUnchangedSince(goal, body.data.updatedAt);

      // The database deletes the goal's rules and leaves its events without goal (on delete set null).
      await query(`delete from app.goals where id = $1`, [goal.id]);
      return jsonOk({ message: MESSAGES.goalDeleted });
    });
  });
}
