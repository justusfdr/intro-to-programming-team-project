// The conflict mark (R10). Calculated every time, never saved.
// Overlap never rejects an event. When two timed events overlap and either has may_overlap = false,
// both get the mark and the user decides. Ending exactly when the next starts is no overlap.

export type TimedEvent = { id: string; startAt: Date; endAt: Date; mayOverlap: boolean };

/** True when the two events share some time (touching ends do not count). */
export function overlaps(a: TimedEvent, b: TimedEvent): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

/** The ids of all events that carry a conflict mark. */
export function conflictIds(events: readonly TimedEvent[]): Set<string> {
  const sorted = [...events].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const marked = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    // Sorted by start: once an event starts at or after this one's end, no later one can overlap it.
    for (let j = i + 1; j < sorted.length && sorted[j].startAt < sorted[i].endAt; j++) {
      const [a, b] = [sorted[i], sorted[j]];
      if (overlaps(a, b) && (!a.mayOverlap || !b.mayOverlap)) {
        marked.add(a.id);
        marked.add(b.id);
      }
    }
  }
  return marked;
}
