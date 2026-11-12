import "server-only";

// Action add_task (ontology section 5; spec 11). Same pattern as create_goal:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. remove done tasks older than 7 days (R33, own transaction)
//   5. inside withUser: title, due date against today in the user's time zone, the goal is the user's
//      ("Not found" otherwise, R3), under 100 open tasks (R32), write   6. one answer per outcome.
// The database checks the title, the goal's owner and the 100 again; two additions at the same moment
// take turns there, and the second one is refused with the same message.
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertOwnGoal } from "@/lib/server/goals/own-goal";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { asTaskLimitError, assertRoomForOpenTask, checkTaskFields, TaskFields } from "@/lib/server/tasks/input";
import { countOpenTasks, TASK_COLUMNS, toTaskDto, type TaskRow } from "@/lib/server/tasks/rows";
import { settleTasks } from "@/lib/server/tasks/settle";
import { localDateOf } from "@/lib/time/zoned";

export function addTask(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, TaskFields);
    if (!body.ok) return body.response;

    await settleTasks(deps, userId);

    try {
      return await deps.withUser(userId, async (query) => {
        // Both reads are sent together; the checks below keep their order (and so their messages).
        const [timeZone, openTasks] = await Promise.all([readTimeZone(query), countOpenTasks(query)]);
        const today = localDateOf(deps.now(), timeZone);
        const task = checkTaskFields(body.data, today);
        await assertOwnGoal(query, task.goalId);
        assertRoomForOpenTask(openTasks);

        // user_id, status, done_at, created_at and updated_at are filled in by the database.
        const [saved] = await query<TaskRow>(
          `insert into app.tasks (title, goal_id, due_date) values ($1, $2, $3) returning ${TASK_COLUMNS}`,
          [task.title, task.goalId, task.dueDate],
        );
        return jsonOk({ message: MESSAGES.taskSaved, task: toTaskDto(saved) }, 201);
      });
    } catch (error) {
      throw asTaskLimitError(error);
    }
  });
}
