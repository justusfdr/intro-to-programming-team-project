import "server-only";

// Action load_demo ("Explore the demo", ontology section 5; spec 13). Same pattern as create_goal:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the (empty) body
//   4. remove done tasks older than 7 days (R33, own transaction)
//   5. inside withUser, as the signed-in user and in one transaction: no demo rows yet, room for the
//      demo's open tasks (R32); then the goals with their rules, the tasks, this week's events (past
//      ones marked done) and the welcome marked as answered   6. one answer per outcome.
// Every row is written as the user, through the same column rights, checks and limits as the user's
// own rows, and carries the demo mark, so remove_demo can find exactly these rows again.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { DEMO_DEADLINE_DAYS, DEMO_EVENTS, DEMO_GOALS, demoTasks } from "@/lib/server/demo/data";
import { hasDemoRows } from "@/lib/server/demo/rows";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { asTaskLimitError, tooManyTasks } from "@/lib/server/tasks/input";
import { countOpenTasks } from "@/lib/server/tasks/rows";
import { settleTasks } from "@/lib/server/tasks/settle";
import { addDays, localDateOf, mondayOf, parseLocalDateTime } from "@/lib/time/zoned";

const Empty = z.strictObject({});

export function loadDemo(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, Empty);
    if (!body.ok) return body.response;

    await settleTasks(deps, userId);

    try {
      return await deps.withUser(userId, async (query) => {
        // Two requests at once (a double click, two devices) take turns on the user's settings row,
        // so the second one sees the first one's demo and is rejected.
        await query("select 1 from app.settings for update");
        if (await hasDemoRows(query)) throw new ActionError(409, "demo_loaded", MESSAGES.demoLoaded);

        const now = deps.now();
        const timeZone = await readTimeZone(query);
        const today = localDateOf(now, timeZone);
        const monday = mondayOf(today);
        const tasks = demoTasks(today, monday);
        const openTasks = tasks.filter((task) => !task.done).length;
        if ((await countOpenTasks(query)) + openTasks > 100) throw tooManyTasks();

        // Goals, each with one hours-per-week rule. All rows of one transaction share created_at, and
        // the goals column then orders by id; so three rows are added first and the prototype's goals
        // are then written into them in id order, which keeps the prototype's order in the column.
        const deadline = addDays(today, DEMO_DEADLINE_DAYS);
        const rowIds: string[] = [];
        for (const goal of DEMO_GOALS) {
          const [{ id }] = await query<{ id: string }>(
            "insert into app.goals (title, deadline, color, icon, why, demo) values ($1, $2, $3, $4, $5, true) returning id",
            [goal.title, deadline, goal.color, goal.icon, goal.why],
          );
          await query("insert into app.rules (goal_id, kind, target) values ($1, 'hours', $2)", [id, goal.hoursPerWeek]);
          rowIds.push(id);
        }
        rowIds.sort();
        const goalIds = new Map<string, string>();
        for (const [index, goal] of DEMO_GOALS.entries()) {
          const id = rowIds[index];
          await query("update app.goals set title = $2, color = $3, icon = $4, why = $5 where id = $1", [id, goal.title, goal.color, goal.icon, goal.why]);
          await query("update app.rules set target = $2 where goal_id = $1", [id, goal.hoursPerWeek]);
          goalIds.set(goal.key, id);
        }

        // Tasks: added open, then the done ones completed (the database sets done_at, as for complete_task).
        for (const task of tasks) {
          const [{ id }] = await query<{ id: string }>(
            "insert into app.tasks (title, goal_id, due_date, demo) values ($1, $2, $3, true) returning id",
            [task.title, task.goal ? goalIds.get(task.goal) : null, task.dueDate],
          );
          if (task.done) await query("update app.tasks set status = 'done' where id = $1", [id]);
        }

        // This week's events: added planned, then those that have ended marked done (mark_event_done).
        for (const event of DEMO_EVENTS) {
          const date = addDays(monday, event.day);
          const start = parseLocalDateTime(`${date}T${event.from}`, timeZone);
          const end = parseLocalDateTime(`${date}T${event.to}`, timeZone);
          if (!start || !end) continue;
          const [{ id }] = await query<{ id: string }>(
            "insert into app.events (title, start_at, end_at, goal_id, demo) values ($1, $2, $3, $4, true) returning id",
            [event.title, start, end, event.goal ? goalIds.get(event.goal) : null],
          );
          if (end <= now && !event.skipped) await query("update app.events set status = 'done' where id = $1", [id]);
        }

        await query("update app.settings set welcome_answered = true");
        return jsonOk({ message: MESSAGES.demoAdded }, 201);
      });
    } catch (error) {
      throw asTaskLimitError(error);
    }
  });
}
