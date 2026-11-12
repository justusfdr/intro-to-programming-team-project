// The rules of src/components/live/Live.tsx as pure functions, so they can be tested without a browser:
// which local changes are shown on top of the server's data, and when each one goes away.
import type { WeekData } from "@/lib/events/types";
import type { SettingsData } from "@/lib/settings/types";
import type { TaskDto } from "@/lib/tasks/types";

/** What an action changes on screen, per kind of data the page shows. Each is a "set" step. */
export type Changes = {
  tasks?: (tasks: TaskDto[]) => TaskDto[];
  week?: (week: WeekData) => WeekData;
  settings?: (settings: SettingsData) => SettingsData;
};

/** "sending": waiting for the answer. "refreshing": accepted, waiting for the page's re-read. */
export type Patch = { id: number; changes: Changes; phase: "sending" | "refreshing" };

/** An action starts: its optimistic change (if any) shows at once. */
export function started(list: Patch[], id: number, optimistic: Changes | undefined): Patch[] {
  return optimistic ? [...list, { id, changes: optimistic, phase: "sending" }] : list;
}

/** The action was rejected: its change goes away, the screen shows the server's data again (R1). */
export function rejected(list: Patch[], id: number): Patch[] {
  return list.filter((p) => p.id !== id);
}

/** The action was accepted: the change from the answer (or the optimistic one) stays until the re-read. */
export function accepted(list: Patch[], id: number, changes: Changes | null): Patch[] {
  const rest = list.filter((p) => p.id !== id);
  return changes ? [...rest, { id, changes, phase: "refreshing" }] : rest;
}

/** Every re-read has arrived: the server's data holds the accepted changes. Actions still waiting stay. */
export function reread(list: Patch[]): Patch[] {
  return list.filter((p) => p.phase === "sending");
}

/** The server's data with the changes on top, in the order the actions started. */
export function applyPatches<K extends keyof Changes>(list: readonly Patch[], kind: K, server: Parameters<NonNullable<Changes[K]>>[0]) {
  let value = server;
  for (const patch of list) {
    const apply = patch.changes[kind] as ((v: typeof server) => typeof server) | undefined;
    if (apply) value = apply(value);
  }
  return value;
}

/** "Set" steps for tasks: the task as saved (added or replaced), or removed. */
export const taskChanges = {
  saved: (task: TaskDto): Changes => ({
    tasks: (list) => (list.some((t) => t.id === task.id) ? list.map((t) => (t.id === task.id ? task : t)) : [...list, task]),
  }),
  removed: (id: string): Changes => ({ tasks: (list) => list.filter((t) => t.id !== id) }),
};
