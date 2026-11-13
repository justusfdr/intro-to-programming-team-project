import "server-only";

// Reading and writing the to-dos of an event (spec 21), always inside withUser, so row-level security
// limits every statement to the signed-in user (R3). The list's order is the column "position"; our
// code keeps it 0, 1, 2, … without gaps.
import type { Query } from "@/lib/server/db";
import type { NewTodo, TodoDto } from "@/lib/todos/types";

type TodoRow = { id: string; title: string; done: boolean };

/** The event's to-dos in their order. */
export async function readTodos(query: Query, eventId: string): Promise<TodoDto[]> {
  const rows = await query<TodoRow>("select id, title, done from app.event_todos where event_id = $1 order by position, id", [eventId]);
  return rows.map((r) => ({ id: r.id, title: r.title, done: r.done }));
}

/**
 * Puts the event's to-dos in this order (the ids of all of them), numbered from 0. One statement, so
 * the database's "one to-do per place" holds at its end.
 */
export async function renumber(query: Query, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await query(
    `update app.event_todos t set position = (v.n - 1)::int
       from unnest($1::uuid[]) with ordinality as v(id, n)
      where t.id = v.id and t.position is distinct from (v.n - 1)::int`,
    [ids],
  );
}

/**
 * Writes the same list of to-dos onto each of these events (a new event, every event of a new series,
 * an event brought back by undo), in one statement. The titles are already checked.
 */
export async function insertTodos(query: Query, eventIds: readonly string[], todos: readonly NewTodo[]): Promise<void> {
  if (eventIds.length === 0 || todos.length === 0) return;
  await query(
    `insert into app.event_todos (event_id, title, done, position)
     select e.id, t.title, t.done::boolean, (t.n - 1)::int
       from unnest($1::uuid[]) as e(id)
       cross join unnest($2::text[], $3::text[]) with ordinality as t(title, done, n)`,
    // "done" travels as text and is cast in the database (t.done::boolean above): the real driver
    // sends a list of booleans as one boolean, which the database then refuses to read as a list.
    // The test database does not show this.
    [eventIds, todos.map((t) => t.title), todos.map((t) => String(t.done))],
  );
}

/** The two numbers the calendar shows on a block ("2/3"). */
export function countsOf(todos: readonly { done: boolean }[]): { todoCount: number; todosDone: number } {
  return { todoCount: todos.length, todosDone: todos.filter((t) => t.done).length };
}
