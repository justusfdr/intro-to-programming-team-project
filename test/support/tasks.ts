// Helpers for task tests: put tasks straight into the database (bypassing the actions), read them
// back, and move a done task's done_at into the past (the database owns done_at, so only the test's
// owner connection can do that, with the trigger switched off for one statement).
import type { TestDb } from "../db/harness";

export type SeedTask = {
  title?: string;
  goalId?: string | null;
  dueDate?: string | null; // "2026-11-20"
  status?: "open" | "done";
};

/** Inserts a task for `userId` as the database owner and returns its id. */
export async function seedTask(db: TestDb, userId: string, task: SeedTask = {}): Promise<string> {
  const [row] = await db.admin<{ id: string }>(
    `insert into app.tasks (user_id, title, goal_id, due_date, status) values ($1, $2, $3, $4, $5) returning id`,
    [userId, task.title ?? "Buy running shoes", task.goalId ?? null, task.dueDate ?? null, task.status ?? "open"],
  );
  return row.id;
}

/** Inserts `count` open tasks without goal or date for `userId` in one statement. */
export async function seedOpenTasks(db: TestDb, userId: string, count: number): Promise<void> {
  await db.admin(
    `insert into app.tasks (user_id, title) select $1, 'Task ' || n from generate_series(1, $2::int) as n`,
    [userId, count],
  );
}

/** A user's tasks as the database holds them, oldest first. */
export async function tasksOf(db: TestDb, userId: string) {
  return db.admin<{
    id: string;
    title: string;
    goal_id: string | null;
    due_date: string | null;
    status: string;
    done_at: Date | null;
    updated_at: Date;
  }>(
    `select id, title, goal_id, due_date::text as due_date, status, done_at, updated_at
       from app.tasks where user_id = $1 order by created_at, title, id`,
    [userId],
  );
}

/** Sets a done task's done_at to `ago` before the database's now ("7 days 1 minute"). */
export async function backdateDone(db: TestDb, taskId: string, ago: string): Promise<void> {
  await db.admin("alter table app.tasks disable trigger set_tasks_done_at");
  try {
    await db.admin("update app.tasks set done_at = now() - $2::interval where id = $1 and status = 'done'", [taskId, ago]);
  } finally {
    await db.admin("alter table app.tasks enable trigger set_tasks_done_at");
  }
}
