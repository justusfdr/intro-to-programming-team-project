import "server-only";

// Finding one of the signed-in user's tasks by id, for edit, complete, reopen and delete. Another
// user's task, a deleted one and an id that is not a uuid all get the same answer: "Not found" (R3).
// Row-level security does the real work; this only turns "no row" into the answer.
import type { Query } from "@/lib/server/db";
import { notFound } from "@/lib/server/events/own-event";
import { TASK_COLUMNS, type TaskRow } from "./rows";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The user's task, locked until the transaction ends (a second device waits). "Not found" otherwise. */
export async function findOwnTask(query: Query, id: string): Promise<TaskRow> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await query<TaskRow>(`select ${TASK_COLUMNS} from app.tasks where id = $1 for update`, [id]);
  if (!row) throw notFound();
  return row;
}
