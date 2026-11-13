import "server-only";

// The checks of the to-do actions and of create_event's list (spec 21), each with the ontology's
// message, and how the database's own refusals (two requests at the same moment) become those messages.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { ActionError } from "@/lib/server/errors";
import { MAX_TODO_TITLE, MAX_TODOS, type NewTodo } from "@/lib/todos/types";

/** create_event's optional list: titles and whether each is done (the calendar's undo brings done ones back). */
export const TodoListField = z.array(z.object({ title: z.string().max(1000), done: z.boolean().optional() }).strict()).max(100);

export const TitleBody = z.object({ title: z.string().max(1000) });

export function tooManyTodos(): ActionError {
  return new ActionError(409, "too_many_todos", MESSAGES.tooManyTodos);
}

export function notOnOutlook(): ActionError {
  return new ActionError(409, "outlook_event", MESSAGES.todosNotOutlook);
}

/** A title trimmed, 1 to 100 characters (counted as the user sees them). */
export function checkTodoTitle(raw: string): string {
  const title = raw.trim();
  const length = [...title].length;
  if (length < 1 || length > MAX_TODO_TITLE) throw new ActionError(400, "todo_title_length", MESSAGES.todoTitleLength);
  return title;
}

/** create_event's list: at most 20, every title checked. Empty or left out: no to-dos. */
export function checkTodoList(list: z.infer<typeof TodoListField> | undefined): NewTodo[] {
  if (!list) return [];
  if (list.length > MAX_TODOS) throw tooManyTodos();
  return list.map((t) => ({ title: checkTodoTitle(t.title), done: t.done ?? false }));
}

/** Under 20 before one more is added. */
export function assertRoomForTodo(count: number): void {
  if (count >= MAX_TODOS) throw tooManyTodos();
}

/**
 * The database refuses with the same words when two requests arrive at the same moment, or when a
 * rule is broken that our server checked a moment earlier. Turns that into the ontology's answer.
 */
export function asTodoError(error: unknown): unknown {
  const message = error instanceof Error ? error.message : "";
  if (message.includes(MESSAGES.tooManyTodos)) return tooManyTodos();
  if (message.includes(MESSAGES.todosNotOutlook)) return notOnOutlook();
  return error;
}
