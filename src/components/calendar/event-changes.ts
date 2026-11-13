// What the calendar sends for a drop, an undo and a re-created event, and what it shows at once.
// Pure functions (tested in event-changes.test.ts); the server checks every rule.
//
// - A move or a resize is edit_event with the new local start and end and the updated_at the screen
//   last saw (R4). The title goes along (edit_event needs it); goal and overlap are left out, so they
//   stay as they are.
// - Undo of a move or a resize is edit_event back to the old times, with the updated_at of the move's
//   answer. If the event changed again since, the server refuses (R4) and its message shows.
// - Undo of a delete is create_event with the same fields: the event comes back with a new id, with
//   the to-dos the delete's answer named (spec 21).
import type { Changes } from "@/components/live/Live";
import type { PostResult } from "@/lib/client/post-json";
import type { CalendarEvent, EventDto, WeekEvent } from "@/lib/events/types";
import { withEventChange } from "@/lib/events/week-view";
import { fmtDateShort, fmtRange, type TimeFormat } from "@/lib/time/display";
import { parseLocalDateTime } from "@/lib/time/zoned";
import type { NewTodo } from "@/lib/todos/types";

export type Scope = "this" | "this_and_following";

/** The week change an accepted save describes: the event as saved. A series (with a count) waits for the re-read. */
export function savedEventChange(answer: PostResult): Changes | null {
  const data = answer.data as { event?: EventDto; count?: unknown } | undefined;
  if (!data?.event || data.count !== undefined) return null;
  const saved = data.event;
  return { week: (week) => withEventChange(week, { event: saved }) };
}

/** The event as saved in an accepted answer, or null. */
export function savedEvent(answer: PostResult): EventDto | null {
  return (answer.data as { event?: EventDto } | undefined)?.event ?? null;
}

/** The body of edit_event for new times (a move, a resize, or the undo of one). */
export function timesBody(event: Pick<WeekEvent, "title">, start: string, end: string, updatedAt: string, scope?: Scope) {
  return scope ? { title: event.title, start, end, updatedAt, scope } : { title: event.title, start, end, updatedAt };
}

/**
 * The week with the event at its new times, shown as soon as it is dropped. Null when the times are
 * not real in the time zone (the server would refuse them anyway) or for "this and following", where
 * every event keeps its own date and the re-read brings them all.
 */
export function movedChange(event: WeekEvent, start: string, end: string, timeZone: string, scope?: Scope): Changes | null {
  if (scope === "this_and_following") return null;
  const startAt = parseLocalDateTime(start, timeZone);
  const endAt = parseLocalDateTime(end, timeZone);
  if (!startAt || !endAt) return null;
  const moved: EventDto = {
    id: event.id,
    title: event.title,
    allDay: false,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    firstDay: null,
    lastDay: null,
    mayOverlap: event.mayOverlap,
    status: event.status,
    goalId: event.goalId,
    seriesId: event.seriesId,
    source: event.source,
    location: event.location,
    notSent: event.notSent,
    updatedAt: event.updatedAt,
    todoCount: event.todoCount,
    todosDone: event.todosDone,
  };
  return { week: (week) => withEventChange(week, { event: moved }) };
}

/** The body of create_event that brings a deleted event back (it gets a new id), with its to-dos (spec 21). */
export function recreateBody(event: CalendarEvent, todos: readonly NewTodo[] = []) {
  const list = todos.length > 0 ? { todos: todos.map((t) => ({ title: t.title, done: t.done })) } : {};
  if (event.allDay) return { title: event.title, allDay: true, firstDay: event.firstDay, lastDay: event.lastDay, ...list };
  return { title: event.title, start: event.startLocal, end: event.endLocal, mayOverlap: event.mayOverlap, goalId: event.goalId, ...list };
}

/** The to-dos a delete's answer names (spec 21), to bring them back with Undo. */
export function deletedTodos(answer: PostResult): NewTodo[] {
  const todos = (answer.data as { todos?: unknown } | undefined)?.todos;
  if (!Array.isArray(todos)) return [];
  return todos.flatMap((t) =>
    t && typeof t === "object" && typeof (t as NewTodo).title === "string" ? [{ title: (t as NewTodo).title, done: (t as NewTodo).done === true }] : [],
  );
}

/**
 * The toast after a drop, as in the prototype: "Moved to Tue, Nov 17, 9 – 10am" or "Resized to …".
 * For "this and following" every event keeps its own date (R28), so the toast names only the times.
 */
export function dropText(event: WeekEvent, start: string, end: string, format: TimeFormat, scope?: Scope): string {
  const verb = start === event.startLocal ? "Resized" : "Moved";
  const times = fmtRange(start.slice(11), end.slice(11), format);
  if (scope === "this_and_following") return `${verb} this and following events to ${times}`;
  return `${verb} to ${fmtDateShort(start.slice(0, 10))}, ${times}`;
}
