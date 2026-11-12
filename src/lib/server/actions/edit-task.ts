import "server-only";

// Action edit_task (ontology section 5; spec 11). Same pattern as edit_goal, without the two-device
// check: the ontology's input for edit_task has no updated_at.
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. remove done tasks older than 7 days (R33, own transaction)
//   5. inside withUser: find the user's task ("Not found" otherwise, R3), check title, due date (an
//      unchanged past date may stay) and goal, write   6. one answer per outcome.
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertOwnGoal } from "@/lib/server/goals/own-goal";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { checkTaskFields, TaskFields } from "@/lib/server/tasks/input";
import { findOwnTask } from "@/lib/server/tasks/own-task";
import { TASK_COLUMNS, toTaskDto, type TaskRow } from "@/lib/server/tasks/rows";
import { settleTasks } from "@/lib/server/tasks/settle";
import { localDateOf } from "@/lib/time/zoned";

export function editTask(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, TaskFields);
    if (!body.ok) return body.response;

    await settleTasks(deps, userId);

    return deps.withUser(userId, async (query) => {
      // Locks the task until the transaction ends, so a second device waits instead of racing.
      const current = await findOwnTask(query, id);
      const today = localDateOf(deps.now(), await readTimeZone(query));
      const task = checkTaskFields(body.data, today, current.due_date);
      await assertOwnGoal(query, task.goalId);

      const [saved] = await query<TaskRow>(
        `update app.tasks set title = $2, goal_id = $3, due_date = $4 where id = $1 returning ${TASK_COLUMNS}`,
        [current.id, task.title, task.goalId, task.dueDate],
      );
      return jsonOk({ message: MESSAGES.taskSaved, task: toTaskDto(saved) });
    });
  });
}
