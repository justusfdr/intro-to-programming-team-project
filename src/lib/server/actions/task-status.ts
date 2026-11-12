import "server-only";

// Actions complete_task and reopen_task (ontology section 5; spec 11). Same pattern as
// mark_event_done, without a body:
//   1. same-origin check   2. signed in (R3)   3. remove done tasks older than 7 days (R33, own transaction)
//   4. inside withUser: find the user's task ("Not found" otherwise, R3), check its status, for
//      reopen_task also under 100 open tasks (R32), write   5. one answer per outcome.
// The database sets done_at; it also refuses a reopen over the limit when two arrive at once.
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { asTaskLimitError, assertRoomForOpenTask } from "@/lib/server/tasks/input";
import { findOwnTask } from "@/lib/server/tasks/own-task";
import { countOpenTasks, TASK_COLUMNS, toTaskDto, type TaskRow } from "@/lib/server/tasks/rows";
import { settleTasks } from "@/lib/server/tasks/settle";

type StatusDeps = Pick<Deps, "auth" | "withUser">;

function notPossible(): ActionError {
  return new ActionError(409, "not_possible", MESSAGES.notPossible);
}

export function completeTask(request: Request, deps: StatusDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);
    await settleTasks(deps, userId);

    return deps.withUser(userId, async (query) => {
      const task = await findOwnTask(query, id);
      if (task.status !== "open") throw notPossible();
      const [saved] = await query<TaskRow>(`update app.tasks set status = 'done' where id = $1 returning ${TASK_COLUMNS}`, [task.id]);
      return jsonOk({ message: MESSAGES.taskDone, task: toTaskDto(saved) });
    });
  });
}

export function reopenTask(request: Request, deps: StatusDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);
    await settleTasks(deps, userId);

    try {
      return await deps.withUser(userId, async (query) => {
        // Both reads are sent together; the checks keep their order.
        const [openTasks, task] = await Promise.all([countOpenTasks(query), findOwnTask(query, id)]);
        if (task.status !== "done") throw notPossible();
        assertRoomForOpenTask(openTasks);
        const [saved] = await query<TaskRow>(`update app.tasks set status = 'open' where id = $1 returning ${TASK_COLUMNS}`, [task.id]);
        return jsonOk({ message: MESSAGES.taskReopened, task: toTaskDto(saved) });
      });
    } catch (error) {
      throw asTaskLimitError(error);
    }
  });
}
