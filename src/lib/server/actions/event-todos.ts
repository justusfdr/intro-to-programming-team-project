import "server-only";

// The to-dos inside an event (spec 21; ontology section 5): add_todo, rename_todo, tick_todo,
// move_todo, delete_todo, and reading an event's list for its editor. Each is saved at once, in the
// pattern of the task actions:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: the user's event or to-do, locked ("Not found" otherwise, R3), the rules, write
//   5. one answer per outcome: the event's whole list as it is now, and its two numbers ("2/3").
// The database checks the title, the event's owner, the limit of 20 and R11 again; two additions at the
// same moment take turns there, and the second one is refused with the same message.
// A change of a to-do is not a change of the event: its updated_at stays (R4), nothing goes to Outlook.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { asTodoError, assertRoomForTodo, checkTodoTitle, notOnOutlook, TitleBody } from "@/lib/server/todos/input";
import { findOwnTodo, findTodoEvent } from "@/lib/server/todos/own";
import { countsOf, readTodos, renumber } from "@/lib/server/todos/rows";
import type { Query } from "@/lib/server/db";

type TodoDeps = Pick<Deps, "auth" | "withUser">;

const DoneBody = z.object({ done: z.boolean() });
/** The new place, counted from 0; a place past the end means the end. */
const MoveBody = z.object({ toIndex: z.number().int().min(0).max(99) });

/** The answer of every to-do action: the event's list as it is now. */
async function listAnswer(query: Query, eventId: string, message: string, status = 200): Promise<Response> {
  const todos = await readTodos(query, eventId);
  return jsonOk({ message, eventId, todos, ...countsOf(todos) }, status);
}

/** Runs a to-do action: same-origin, signed in, then `run` in one transaction as the user. */
function todoAction(request: Request, deps: TodoDeps, run: (query: Query) => Promise<Response>): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    try {
      return await deps.withUser(userId, run);
    } catch (error) {
      throw asTodoError(error);
    }
  });
}

/** The editor of an event reads its list (no change). An Outlook event has none. */
export function listTodos(request: Request, deps: TodoDeps, eventId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    return deps.withUser(userId, async (query) => {
      await findTodoEvent(query, eventId);
      return listAnswer(query, eventId, "");
    });
  });
}

/** add_todo: at the end of the event's list. */
export function addTodo(request: Request, deps: TodoDeps, eventId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, TitleBody);
    if (!body.ok) return body.response;
    try {
      return await deps.withUser(userId, async (query) => {
        const event = await findTodoEvent(query, eventId);
        // In the ontology's order: not on an Outlook event (R11), the title, the limit of 20.
        if (event.source === "outlook") throw notOnOutlook();
        const title = checkTodoTitle(body.data.title);
        const todos = await readTodos(query, event.id);
        assertRoomForTodo(todos.length);
        // user_id, done (false) and created_at are filled in by the database.
        await query("insert into app.event_todos (event_id, title, position) values ($1, $2, $3)", [event.id, title, todos.length]);
        return listAnswer(query, event.id, MESSAGES.todoAdded, 201);
      });
    } catch (error) {
      throw asTodoError(error);
    }
  });
}

/** rename_todo: a new title. */
export function renameTodo(request: Request, deps: TodoDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, TitleBody);
    if (!body.ok) return body.response;
    return deps.withUser(userId, async (query) => {
      const todo = await findOwnTodo(query, id);
      const title = checkTodoTitle(body.data.title);
      await query("update app.event_todos set title = $2 where id = $1", [todo.id, title]);
      return listAnswer(query, todo.eventId, MESSAGES.todoSaved);
    });
  });
}

/** tick_todo: done or not done again (sending the state it has already changes nothing and is fine). */
export function tickTodo(request: Request, deps: TodoDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, DoneBody);
    if (!body.ok) return body.response;
    return deps.withUser(userId, async (query) => {
      const todo = await findOwnTodo(query, id);
      await query("update app.event_todos set done = $2 where id = $1", [todo.id, body.data.done]);
      return listAnswer(query, todo.eventId, body.data.done ? MESSAGES.todoDone : MESSAGES.todoOpen);
    });
  });
}

/** move_todo: to another place in the list (the prototype's drag and arrow keys); the others close up. */
export function moveTodo(request: Request, deps: TodoDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, MoveBody);
    if (!body.ok) return body.response;
    return deps.withUser(userId, async (query) => {
      const todo = await findOwnTodo(query, id);
      const ids = (await readTodos(query, todo.eventId)).map((t) => t.id).filter((other) => other !== todo.id);
      ids.splice(Math.min(body.data.toIndex, ids.length), 0, todo.id);
      await renumber(query, ids);
      return listAnswer(query, todo.eventId, MESSAGES.todoMoved);
    });
  });
}

/** delete_todo: always allowed; the later ones move up. */
export function deleteTodo(request: Request, deps: TodoDeps, id: string): Promise<Response> {
  return todoAction(request, deps, async (query) => {
    const todo = await findOwnTodo(query, id);
    await query("delete from app.event_todos where id = $1", [todo.id]);
    await renumber(query, (await readTodos(query, todo.eventId)).map((t) => t.id));
    return listAnswer(query, todo.eventId, MESSAGES.todoDeleted);
  });
}
