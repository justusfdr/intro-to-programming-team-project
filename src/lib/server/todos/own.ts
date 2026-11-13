import "server-only";

// Finding the signed-in user's event or to-do by id for the to-do actions (spec 21). Another user's
// row, a deleted one and an id that is not a uuid all get the same answer: "Not found" (R3). The
// event's row is locked until the transaction ends, so two changes of one event's list take turns
// (the places stay without gaps, and the limit of 20 is counted on the list as it is).
import type { Query } from "@/lib/server/db";
import { notFound } from "@/lib/server/events/own-event";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TodoEvent = { id: string; source: string };

/** The user's event, locked. "Not found" otherwise. */
export async function findTodoEvent(query: Query, eventId: string): Promise<TodoEvent> {
  if (!UUID.test(eventId)) throw notFound();
  const [row] = await query<TodoEvent>("select id, source from app.events where id = $1 for update", [eventId]);
  if (!row) throw notFound();
  return row;
}

/** The user's to-do and its event, both locked. "Not found" otherwise. */
export async function findOwnTodo(query: Query, id: string): Promise<{ id: string; eventId: string }> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await query<{ id: string; event_id: string }>(
    `select t.id, t.event_id from app.event_todos t join app.events e on e.id = t.event_id and e.user_id = t.user_id
      where t.id = $1 for update`,
    [id],
  );
  if (!row) throw notFound();
  return { id: row.id, eventId: row.event_id };
}
