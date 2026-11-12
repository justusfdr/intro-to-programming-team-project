import "server-only";

// Action delete_task (ontology section 5, always allowed; spec 11). Same pattern as delete_goal,
// without a body and without the two-device check (the ontology's input is the task alone):
//   1. same-origin check   2. signed in (R3)   3. inside withUser: find the user's task ("Not found"
//   otherwise, R3), delete it   4. one answer per outcome.
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { findOwnTask } from "@/lib/server/tasks/own-task";

export function deleteTask(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    return deps.withUser(userId, async (query) => {
      const task = await findOwnTask(query, id);
      await query("delete from app.tasks where id = $1", [task.id]);
      return jsonOk({ message: MESSAGES.taskDeleted });
    });
  });
}
