import "server-only";

// Reading task rows: the columns every task read selects and how a row becomes what the page gets.
import type { Query } from "@/lib/server/db";
import type { TaskDto } from "@/lib/tasks/types";

export const TASK_COLUMNS = "id, title, goal_id, due_date::text as due_date, status, done_at";

export type TaskRow = {
  id: string;
  title: string;
  goal_id: string | null;
  due_date: string | null;
  status: "open" | "done";
  done_at: Date | null;
};

export function toTaskDto(row: TaskRow): TaskDto {
  return {
    id: row.id,
    title: row.title,
    goalId: row.goal_id,
    dueDate: row.due_date,
    status: row.status,
    doneAt: row.done_at ? new Date(row.done_at).toISOString() : null,
  };
}

/** The user's tasks, oldest first (row-level security limits them to the user). */
export async function readTasks(query: Query): Promise<TaskDto[]> {
  const rows = await query<TaskRow>(`select ${TASK_COLUMNS} from app.tasks order by created_at, id`);
  return rows.map(toTaskDto);
}

/** How many open tasks the user has (R32). */
export async function countOpenTasks(query: Query): Promise<number> {
  const [{ n }] = await query<{ n: number }>("select count(*)::int as n from app.tasks where status = 'open'");
  return n;
}
