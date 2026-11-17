// The overlap notice (R10, changed with issue #106). Calculated every time, never saved.
// Overlap never rejects an event. An event gets the notice when it shares time with another timed event,
// or when the trip to it (from the time to leave to its start) shares time with another event, unless
// the person said "That's fine" (may_overlap = true). "That's fine" on one event settles the whole
// pair: an overlap counts only when neither of the two events was accepted. Ending exactly when the
// next starts is no overlap.

export type TimedEvent = { id: string; startAt: Date; endAt: Date; mayOverlap: boolean };

/** True when the two events share some time (touching ends do not count). */
export function overlaps(a: Pick<TimedEvent, "startAt" | "endAt">, b: Pick<TimedEvent, "startAt" | "endAt">): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

/** The ids of all events that overlap another event, where neither of the two was accepted ("That's fine"). */
export function conflictIds(events: readonly TimedEvent[]): Set<string> {
  const sorted = [...events].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const marked = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    // Sorted by start: once an event starts at or after this one's end, no later one can overlap it.
    for (let j = i + 1; j < sorted.length && sorted[j].startAt < sorted[i].endAt; j++) {
      const [a, b] = [sorted[i], sorted[j]];
      if (!overlaps(a, b) || a.mayOverlap || b.mayOverlap) continue;
      marked.add(a.id);
      marked.add(b.id);
    }
  }
  return marked;
}

/** An event with its title, for saying what it overlaps. */
export type NamedEvent = TimedEvent & { title: string };

/** What an event's notice says: the other event it overlaps, or the event its trip runs into. */
export type Overlap = { kind: "event" | "trip"; other: NamedEvent };

/**
 * The first overlap of this event (by the other event's start), or null: first with another event,
 * then with its trip there ([leaveAt, start)). Null as well when the event was accepted (may_overlap).
 */
export function overlapOf(event: TimedEvent, others: readonly NamedEvent[], leaveAt?: Date | null): Overlap | null {
  if (event.mayOverlap) return null;
  // An event that was accepted settles every overlap with it.
  const rest = others.filter((o) => o.id !== event.id && !o.mayOverlap).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const hit = rest.find((o) => overlaps(event, o));
  if (hit) return { kind: "event", other: hit };
  if (leaveAt && leaveAt < event.startAt) {
    const trip = { startAt: leaveAt, endAt: event.startAt };
    const blocked = rest.find((o) => overlaps(trip, o));
    if (blocked) return { kind: "trip", other: blocked };
  }
  return null;
}

/** The ids of the events whose trip runs into another event (and that were not accepted). */
export function tripConflictIds(events: readonly TimedEvent[], leaveAt: (id: string) => Date | null | undefined): Set<string> {
  const marked = new Set<string>();
  for (const event of events) {
    const leave = leaveAt(event.id);
    if (event.mayOverlap || !leave || leave >= event.startAt) continue;
    const trip = { startAt: leave, endAt: event.startAt };
    if (events.some((o) => o.id !== event.id && !o.mayOverlap && overlaps(trip, o))) marked.add(event.id);
  }
  return marked;
}
