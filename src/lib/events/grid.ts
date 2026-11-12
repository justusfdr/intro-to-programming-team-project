// Layout maths of the time grid (day and week views): where each event block sits and how tall it is.
// Pure functions, no React. Positions come from the local wall-clock times the server already
// worked out (startLocal, endLocal), so the grid needs no time-zone code of its own.
// Ported from the first prototype's calendar (hour height, lanes for overlapping events, click slots).
import type { WeekDay, WeekEvent } from "./types";

/** Height of one hour in the grid, in pixels. */
export const HOUR_PX = 52;
const DAY_MIN = 24 * 60;
/** Blocks are never drawn shorter than this, so a 15-minute event stays readable and clickable. */
export const MIN_BLOCK_PX = 22;
/** The hours shown when no event lies outside them. */
const DEFAULT_RANGE = { startMin: 7 * 60, endMin: 22 * 60 };

export type GridRange = { startMin: number; endMin: number };

/** One block in one day column. An event past midnight gets a block on each of its two days. */
export type Placed = {
  event: WeekEvent;
  startMin: number;
  endMin: number;
  /** The event started on the day before (this is its continuation after midnight). */
  continuesBefore: boolean;
  /** The event goes on past midnight. */
  continuesAfter: boolean;
  /** Overlapping blocks sit side by side: lane 0 … lanes − 1. */
  lane: number;
  lanes: number;
};

/** "2026-11-16T09:30" → 570 (minutes after midnight). */
export function minuteOfLocal(local: string): number {
  return Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
}

/**
 * Gives overlapping blocks side-by-side lanes. Expects the blocks sorted by start (longer first on a tie).
 * Blocks that overlap directly or through a chain share one group; every block in a group gets the
 * group's lane count, so their widths match.
 */
function assignLanes(blocks: { startMin: number; endMin: number }[]): { lane: number; lanes: number }[] {
  const out = blocks.map(() => ({ lane: 0, lanes: 1 }));
  let group: number[] = [];
  let groupEnd = -Infinity;
  let laneEnds: number[] = [];

  const closeGroup = () => {
    for (const i of group) out[i].lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };

  blocks.forEach((block, i) => {
    if (group.length > 0 && block.startMin >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= block.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.endMin);
    } else {
      laneEnds[lane] = block.endMin;
    }
    out[i].lane = lane;
    group.push(i);
    groupEnd = Math.max(groupEnd, block.endMin);
  });
  closeGroup();
  return out;
}

/**
 * The blocks of every shown day (one day or a week), in time order, with their lanes. `lead` are the
 * events of the day before the first day that run past midnight into it: their part after midnight.
 */
export function placeWeek(days: WeekDay[], lead: readonly WeekEvent[] = []): Placed[][] {
  const perDay: Omit<Placed, "lane" | "lanes">[][] = days.map(() => []);
  for (const event of lead) {
    const endMin = minuteOfLocal(event.endLocal);
    if (days.length > 0 && event.endDay === days[0].date && endMin > 0) {
      perDay[0].push({ event, startMin: 0, endMin, continuesBefore: true, continuesAfter: false });
    }
  }
  days.forEach((day, i) => {
    for (const event of day.events) {
      const startMin = minuteOfLocal(event.startLocal);
      const crosses = event.endDay !== null;
      perDay[i].push({
        event,
        startMin,
        endMin: crosses ? DAY_MIN : minuteOfLocal(event.endLocal),
        continuesBefore: false,
        continuesAfter: crosses,
      });
      // The part after midnight, if the next day is in this week.
      const next = days[i + 1];
      if (crosses && next && event.endDay === next.date) {
        const endMin = minuteOfLocal(event.endLocal);
        if (endMin > 0) perDay[i + 1].push({ event, startMin: 0, endMin, continuesBefore: true, continuesAfter: false });
      }
    }
  });
  return perDay.map((blocks) => {
    const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
    const lanes = assignLanes(sorted);
    return sorted.map((block, i) => ({ ...block, ...lanes[i] }));
  });
}

/**
 * The hours to show: `visible` (the user's "Visible hours"; 07:00 to 22:00 when not given), widened to
 * whole hours so that every event's start fits. The part of an event after midnight does not widen it:
 * that block starts at the top of the grid.
 */
export function gridRange(placed: Placed[][], visible: GridRange = DEFAULT_RANGE): GridRange {
  let { startMin, endMin } = visible;
  for (const block of placed.flat()) {
    if (!block.continuesBefore) startMin = Math.min(startMin, Math.floor(block.startMin / 60) * 60);
    endMin = Math.max(endMin, Math.ceil(block.endMin / 60) * 60);
  }
  return { startMin: Math.max(0, startMin), endMin: Math.min(DAY_MIN, endMin) };
}

export function minuteToPx(min: number, range: GridRange): number {
  return ((min - range.startMin) / 60) * HOUR_PX;
}

export function rangeHeight(range: GridRange): number {
  return ((range.endMin - range.startMin) / 60) * HOUR_PX;
}

/** Top and height of a block, in pixels. A block that starts before the first hour starts at the top. */
export function blockBox(block: { startMin: number; endMin: number }, range: GridRange): { top: number; height: number } {
  const top = minuteToPx(Math.max(block.startMin, range.startMin), range);
  return { top, height: Math.max(MIN_BLOCK_PX, minuteToPx(block.endMin, range) - top) };
}

/**
 * True for the part of an event after midnight that ends before the first visible hour
 * (for example 00:00 to 02:00 when the grid starts at 07:00). Drawn inside the grid it would look
 * like a morning event, so the week shows it as a strip above the hours instead.
 */
export function isBeforeGrid(block: Placed, range: GridRange): boolean {
  return block.continuesBefore && block.endMin <= range.startMin;
}

/** Full hours inside the range, for the hour lines and labels. */
export function hourMarks(range: GridRange): number[] {
  const marks: number[] = [];
  for (let m = range.startMin; m < range.endMin; m += 60) marks.push(m);
  return marks;
}

/** "09:00" for 540. */
export function formatMinute(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * The new event a click on an empty spot suggests: starts at the half hour above the click,
 * lasts one hour, and stays inside the day.
 */
export function slotAt(offsetY: number, range: GridRange): { startMin: number; endMin: number } {
  const clicked = range.startMin + (offsetY / HOUR_PX) * 60;
  const startMin = Math.min(Math.max(Math.floor(clicked / 30) * 30, range.startMin), DAY_MIN - 60);
  return { startMin, endMin: startMin + 60 };
}
