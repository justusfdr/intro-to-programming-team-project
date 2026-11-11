import "server-only";

// Finding one of the signed-in user's events by id, for edit, delete and mark done.
// Another user's event, a deleted one and an id that is not even a uuid all get the same answer:
// "Not found" (R3, A8). Row-level security does the real work; this only turns "no row" into the answer.
import { MESSAGES } from "@/lib/messages";
import type { Query } from "@/lib/server/db";
import { ActionError } from "@/lib/server/errors";
import { EVENT_COLUMNS, type EventRow } from "./rows";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function notFound(): ActionError {
  return new ActionError(404, "not_found", MESSAGES.notFound);
}

/**
 * The user's event with this id, locked until the transaction ends (so a second device that changes
 * the same event at the same moment waits). Throws "Not found" otherwise.
 */
export async function findOwnEvent(query: Query, id: string): Promise<EventRow> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await query<EventRow>(`select ${EVENT_COLUMNS} from app.events where id = $1 for update`, [id]);
  if (!row) throw notFound();
  return row;
}

/**
 * R4 (events and goals): the change must carry the updated_at the device last saw. If the row has changed since
 * (another device saved first), the change is rejected and the first change stays.
 */
export function assertUnchangedSince(row: { updated_at: Date }, updatedAt: string): void {
  if (new Date(row.updated_at).getTime() !== Date.parse(updatedAt)) {
    throw new ActionError(409, "changed_elsewhere", MESSAGES.changedElsewhere);
  }
}
