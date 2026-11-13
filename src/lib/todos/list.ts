// The editor's list of to-dos as pure steps (spec 21), tested in list.test.ts: what the list looks like
// right after a change, before the server's answer (or, for a new event, until "Add event" sends it).
import { MAX_TODO_TITLE, MAX_TODOS } from "./types";

/** A row of the list: `key` is the to-do's id, or a local key for a to-do that is not saved yet. */
export type TodoItem = { key: string; title: string; done: boolean };

/** The item moved from its place to `toIndex` (0 is the top); the others close up. */
export function moveTo<T extends { key: string }>(list: readonly T[], key: string, toIndex: number): T[] {
  const item = list.find((t) => t.key === key);
  if (!item) return [...list];
  const rest = list.filter((t) => t.key !== key);
  rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, item);
  return rest;
}

/** A title as the server will save it, or null when it would be refused (empty or over 100 characters). */
export function cleanTitle(raw: string): string | null {
  const title = raw.trim();
  const length = [...title].length;
  return length >= 1 && length <= MAX_TODO_TITLE ? title : null;
}

/** Whether one more fits (at most 20 per event). */
export function hasRoom(list: readonly unknown[]): boolean {
  return list.length < MAX_TODOS;
}

/** "2/3" and how many are done. */
export function countOf(list: readonly { done: boolean }[]): { done: number; total: number } {
  return { done: list.filter((t) => t.done).length, total: list.length };
}
