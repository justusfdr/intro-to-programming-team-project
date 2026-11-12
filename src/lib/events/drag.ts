// The maths of dragging in the time grid (spec 15), copied from the first prototype's drag logic:
// creating an event by dragging on empty space, moving a block, and dragging its bottom edge.
// Pure functions, no React. All minutes are minutes after midnight of the column's day (0 to 1440).
// The server stays the judge of every rule (end after start, at most 24 hours, R4, R11); these only
// keep the preview inside the same limits, so a drop never asks for something the server refuses.
import { formatMinute, HOUR_PX, type GridRange, type Placed } from "./grid";
import { addDays } from "@/lib/time/zoned";

/** Times snap to a quarter of an hour. */
export const SNAP_MIN = 15;
/** A pointer must move this far before a press becomes a drag (otherwise it is a click). */
export const DRAG_THRESHOLD_PX = 4;
/** The shortest event a drag makes. */
export const MIN_DURATION = 15;
const DAY_MIN = 24 * 60;

export type Span = { startMin: number; endMin: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Rounds to the nearest step (a quarter of an hour by default). */
export function snap(min: number, step: number = SNAP_MIN): number {
  return Math.round(min / step) * step;
}

/** The minute under a height in the grid (not snapped), kept inside the visible hours. */
export function minuteAtY(offsetY: number, range: GridRange, hourPx: number = HOUR_PX): number {
  return clamp(range.startMin + (offsetY / hourPx) * 60, range.startMin, range.endMin);
}

/** Has the pointer moved far enough for a drag rather than a click? */
export function exceedsThreshold(dx: number, dy: number, threshold: number = DRAG_THRESHOLD_PX): boolean {
  return Math.hypot(dx, dy) > threshold;
}

/** Dragging on empty space: from the first minute to the current one, snapped outwards, at least 15 minutes. */
export function createSpan(anchorMin: number, currentMin: number, range: GridRange): Span {
  const lo = clamp(Math.min(anchorMin, currentMin), range.startMin, range.endMin);
  const hi = clamp(Math.max(anchorMin, currentMin), range.startMin, range.endMin);
  let startMin = Math.max(range.startMin, Math.floor(lo / SNAP_MIN) * SNAP_MIN);
  let endMin = Math.min(range.endMin, Math.ceil(hi / SNAP_MIN) * SNAP_MIN);
  if (endMin - startMin < MIN_DURATION) {
    if (startMin + MIN_DURATION <= range.endMin) endMin = startMin + MIN_DURATION;
    else startMin = endMin - MIN_DURATION;
  }
  return { startMin, endMin };
}

/** A click on empty space: one hour (by default) from the half hour above the click. */
export function clickSpan(min: number, range: GridRange, durationMin: number = 60): Span {
  const startMin = clamp(Math.floor(min / 30) * 30, range.startMin, range.endMin - 30);
  return { startMin, endMin: Math.min(startMin + durationMin, DAY_MIN) };
}

/** Moves a span by deltaMin: same length, start snapped, inside the day. */
export function moveSpan(span: Span, deltaMin: number): Span {
  const duration = span.endMin - span.startMin;
  const maxStart = Math.max(0, DAY_MIN - duration);
  const startMin = clamp(snap(span.startMin + deltaMin), 0, maxStart);
  return { startMin, endMin: startMin + duration };
}

/** A new end for a span: snapped, at least 15 minutes after the start, at most midnight. */
export function resizeSpan(span: Span, newEndMin: number): Span {
  const endMin = clamp(snap(newEndMin), span.startMin + MIN_DURATION, DAY_MIN);
  return { startMin: span.startMin, endMin };
}

/** Which day column is under x? Left of all: the first; right of all: the last; in a gap: the nearest middle. */
export function columnIndexAt(clientX: number, columns: { left: number; right: number }[]): number {
  if (columns.length === 0) return -1;
  if (clientX < columns[0].left) return 0;
  if (clientX >= columns[columns.length - 1].right) return columns.length - 1;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    if (clientX >= c.left && clientX < c.right) return i;
    const dist = Math.abs(clientX - (c.left + c.right) / 2);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

/** "YYYY-MM-DDTHH:MM" for minute `min` of `date`; 1440 is 00:00 of the next day, negatives the day before. */
export function localAt(date: string, min: number): string {
  return `${addDays(date, Math.floor(min / DAY_MIN))}T${formatMinute(((min % DAY_MIN) + DAY_MIN) % DAY_MIN)}`;
}

/**
 * Whether a block can be dragged: not from Outlook (R11: its times come from Outlook), not a part of
 * an event past midnight, not a strip above the hours, and not while a save for it is still running.
 * All-day events are never blocks in the grid, so they cannot be dragged either.
 */
export function canDrag(block: Placed, pending: ReadonlySet<string>): boolean {
  const { event } = block;
  // An event that ends exactly at midnight has nothing on the next day: it is a whole block.
  const pastMidnight = block.continuesAfter && !event.endLocal.endsWith("T00:00");
  return event.source !== "outlook" && !block.continuesBefore && !pastMidnight && !pending.has(event.id);
}

/** What a drop asks for: the new local start and end, or null when nothing changed. */
export function dropTimes(event: { startLocal: string; endLocal: string }, date: string, span: Span): { start: string; end: string } | null {
  const start = localAt(date, span.startMin);
  const end = localAt(date, span.endMin);
  return start === event.startLocal && end === event.endLocal ? null : { start, end };
}
