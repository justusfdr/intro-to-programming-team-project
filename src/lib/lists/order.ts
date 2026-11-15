// The order a list is shown in (spec 30): open entries first, in the list's order, then the done ones,
// dimmed, also in the list's order (or hidden with "Hide done"). Moving an entry up or down moves it
// past its neighbour on the screen; the server takes the place in the whole list.
import type { ListEntry } from "./types";

/** Open entries by position, then done entries by position. */
export function shownOrder(entries: readonly ListEntry[]): ListEntry[] {
  const byPlace = [...entries].sort((a, b) => a.position - b.position);
  return [...byPlace.filter((e) => !e.done), ...byPlace.filter((e) => e.done)];
}

/**
 * The place in the whole list (from 0) that moves `id` one step up (-1) or down (+1) among the entries
 * shown with it (the open ones, or the done ones): the place of the neighbour it passes. Null when it
 * is already first or last of its group.
 */
export function stepTarget(entries: readonly ListEntry[], id: string, step: -1 | 1): number | null {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  const group = [...entries].filter((e) => e.done === entry.done).sort((a, b) => a.position - b.position);
  const at = group.findIndex((e) => e.id === id);
  const neighbour = group[at + step];
  return neighbour ? neighbour.position : null;
}

/** The list right after a move, before the server's answer: `id` at place `to`, the others close up. */
export function movedTo(entries: readonly ListEntry[], id: string, to: number): ListEntry[] {
  const byPlace = [...entries].sort((a, b) => a.position - b.position);
  const entry = byPlace.find((e) => e.id === id);
  if (!entry) return byPlace;
  const rest = byPlace.filter((e) => e.id !== id);
  rest.splice(Math.max(0, Math.min(to, rest.length)), 0, entry);
  return rest.map((e, position) => ({ ...e, position }));
}
