// The geometry of a draft drawn as its day (spec 19, step B): which days a draft has, which hours each
// day's small column shows, and where every block sits. Pure functions, no React. Times come in as ISO
// strings in UTC and are placed by their wall-clock time in the user's time zone.
// A proposal belongs to the day it starts (R2), also when it runs past midnight. The column runs from
// the hour before the first proposal to the hour after the last one; the calendar's own events are
// cut to that window.
// Spec 20: a draft may also move and delete existing events. A moved event is drawn on the day of its
// new start, like a proposal, and its old place as an outline on the day it started; a deleted event is
// drawn at its place, struck through. Both stop being drawn as the calendar's own events.
import type { EventDto } from "@/lib/events/types";
import { localDateOf, localTimeOf, type LocalDate } from "@/lib/time/zoned";
import type { DraftChangeDto, ProposedEventDto } from "./types";

/** Height of one hour in the small column, in pixels (smaller than the calendar's 52). */
export const SKETCH_HOUR_PX = 40;
/** Blocks are never drawn shorter than this, so a 15-minute proposal keeps its title. */
export const SKETCH_MIN_BLOCK_PX = 20;
const DAY_MIN = 24 * 60;

/** A block in the column: minutes after the day's midnight, and the local times to print. */
export type SketchBlock = {
  title: string;
  goalId: string | null;
  startMin: number;
  endMin: number;
  /** "09:00": local start and end time; `endsNextDay` when the end falls on a later day. */
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  /** The block began on an earlier day (only the calendar's events, cut at midnight). */
  startsBefore: boolean;
  /** Spec 21: a proposal's to-dos (left out when it has none). */
  todos?: string[];
};

export type SketchDay = {
  date: LocalDate;
  /** The column's window, whole hours: minutes after midnight, 0 to 1440. */
  startMin: number;
  endMin: number;
  /** The hour lines to draw, in minutes after midnight (startMin, startMin + 60, …, endMin). */
  hours: number[];
  /** The draft's proposals that start on this day, by start. */
  proposals: SketchBlock[];
  /**
   * Moved events at their new place on this day, by start; `from` is where they were ("14:00", and the
   * old day when it is another one).
   */
  moved: (SketchBlock & { fromTime: string; fromDate: LocalDate })[];
  /** The old places of events the draft moves away from this day: pale dashed outlines; `toDate` is the new day. */
  oldPlaces: (SketchBlock & { toDate: LocalDate })[];
  /** Events the draft deletes on this day: pale, struck through, "Removed". */
  removed: SketchBlock[];
  /** The calendar's timed events that lie in the window on this day and that the draft leaves alone, by start. */
  existing: SketchBlock[];
  /** The calendar's all-day events covering this day (their titles). */
  allDay: string[];
};

const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * The local days a draft's proposals start on, in order, without repeats; with changes (spec 20) also
 * a moved event's old and new day and a deleted event's day.
 */
export function draftDaysOf(events: readonly ProposedEventDto[], timeZone: string, changes: readonly DraftChangeDto[] = []): LocalDate[] {
  const starts = [
    ...events.map((e) => e.startAt),
    ...changes.flatMap((c) => (c.startAt ? [c.oldStartAt, c.startAt] : [c.oldStartAt])),
  ];
  return [...new Set(starts.map((start) => localDateOf(new Date(start), timeZone)))].sort();
}

const byStart = (a: SketchBlock, b: SketchBlock) => a.startMin - b.startMin || b.endMin - a.endMin;
const isBlock = <T>(b: T | null): b is T => b !== null;

/** One timed event as a block on `date`, or null when no part of it lies on that day. */
function blockOn(
  e: { title: string; goalId: string | null; startAt: string; endAt: string; todos?: string[] },
  date: LocalDate,
  timeZone: string,
): SketchBlock | null {
  const start = new Date(e.startAt);
  const end = new Date(e.endAt);
  const startDay = localDateOf(start, timeZone);
  const endDay = localDateOf(end, timeZone);
  const startTime = localTimeOf(start, timeZone);
  const endTime = localTimeOf(end, timeZone);
  const startsBefore = startDay < date;
  const startMin = startsBefore ? 0 : startDay === date ? minuteOf(startTime) : -1;
  if (startMin < 0) return null;
  // Ends on a later day: the block runs to midnight. An end at exactly midnight is the same.
  const endMin = endDay > date ? DAY_MIN : minuteOf(endTime);
  if (endMin <= startMin) return null;
  const block: SketchBlock = { title: e.title, goalId: e.goalId, startMin, endMin, startTime, endTime, endsNextDay: endDay > startDay, startsBefore };
  return e.todos && e.todos.length > 0 ? { ...block, todos: [...e.todos] } : block;
}

/**
 * The days of a draft with their columns. `calendar` are the calendar's events around it (empty for a
 * draft that is not open: then only the draft itself is drawn). `changes` (spec 20) are its moves and
 * deletes; they carry their own titles and times, so they are drawn also without the calendar.
 */
export function sketchDraft(
  events: readonly ProposedEventDto[],
  calendar: readonly EventDto[],
  timeZone: string,
  changes: readonly DraftChangeDto[] = [],
): SketchDay[] {
  const startDay = (iso: string) => localDateOf(new Date(iso), timeZone);
  const changedIds = new Set(changes.map((c) => c.eventId));
  const old = (c: DraftChangeDto) => ({ title: c.title, goalId: c.goalId, startAt: c.oldStartAt, endAt: c.oldEndAt });

  return draftDaysOf(events, timeZone, changes).map((date) => {
    const proposals = events
      .filter((e) => startDay(e.startAt) === date)
      .map((e) => blockOn(e, date, timeZone))
      .filter(isBlock)
      .sort(byStart);
    const moved = changes
      .filter((c) => c.kind === "move" && c.startAt && c.endAt && startDay(c.startAt) === date)
      .map((c) => {
        const block = blockOn({ title: c.title, goalId: c.goalId, startAt: c.startAt!, endAt: c.endAt! }, date, timeZone);
        return block ? { ...block, fromTime: localTimeOf(new Date(c.oldStartAt), timeZone), fromDate: startDay(c.oldStartAt) } : null;
      })
      .filter(isBlock)
      .sort(byStart);
    const oldPlaces = changes
      .filter((c) => c.kind === "move" && c.startAt && startDay(c.oldStartAt) === date)
      .map((c) => {
        const block = blockOn(old(c), date, timeZone);
        return block ? { ...block, toDate: startDay(c.startAt!) } : null;
      })
      .filter(isBlock)
      .sort(byStart);
    const removed = changes
      .filter((c) => c.kind === "delete" && startDay(c.oldStartAt) === date)
      .map((c) => blockOn(old(c), date, timeZone))
      .filter(isBlock)
      .sort(byStart);

    const drawn = [...proposals, ...moved, ...oldPlaces, ...removed];
    const first = Math.min(...drawn.map((p) => p.startMin));
    const last = Math.max(...drawn.map((p) => p.endMin));
    const startMin = Math.max(0, Math.floor(first / 60) * 60 - 60);
    const endMin = Math.min(DAY_MIN, Math.ceil(last / 60) * 60 + 60);
    const hours: number[] = [];
    for (let m = startMin; m <= endMin; m += 60) hours.push(m);

    const existing = calendar
      .filter((e) => !e.allDay && e.startAt && e.endAt && !changedIds.has(e.id))
      .map((e) => blockOn({ title: e.title, goalId: e.goalId, startAt: e.startAt!, endAt: e.endAt! }, date, timeZone))
      .filter((b): b is SketchBlock => b !== null && b.endMin > startMin && b.startMin < endMin)
      .sort(byStart);
    const allDay = calendar
      .filter((e) => e.allDay && e.firstDay && e.lastDay && e.firstDay <= date && e.lastDay >= date)
      .map((e) => e.title);

    return { date, startMin, endMin, hours, proposals, moved, oldPlaces, removed, existing, allDay };
  });
}

/** Where a block sits in its day's column: top and height in pixels, cut to the window. */
export function sketchBox(block: { startMin: number; endMin: number }, day: { startMin: number; endMin: number }): { top: number; height: number } {
  const from = Math.max(block.startMin, day.startMin);
  const to = Math.min(block.endMin, day.endMin);
  const top = ((from - day.startMin) / 60) * SKETCH_HOUR_PX;
  const height = Math.max(SKETCH_MIN_BLOCK_PX, ((to - from) / 60) * SKETCH_HOUR_PX);
  return { top, height };
}

/** The column's height in pixels. */
export function sketchHeight(day: { startMin: number; endMin: number }): number {
  return ((day.endMin - day.startMin) / 60) * SKETCH_HOUR_PX;
}
