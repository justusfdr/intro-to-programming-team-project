// The geometry of a draft drawn as its day (spec 19, step B): which days a draft has, which hours each
// day's small column shows, and where every block sits. Pure functions, no React. Times come in as ISO
// strings in UTC and are placed by their wall-clock time in the user's time zone.
// A proposal belongs to the day it starts (R2), also when it runs past midnight. The column runs from
// the hour before the first proposal to the hour after the last one; the calendar's own events are
// cut to that window.
import type { EventDto } from "@/lib/events/types";
import { localDateOf, localTimeOf, type LocalDate } from "@/lib/time/zoned";
import type { ProposedEventDto } from "./types";

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
  /** The calendar's timed events that lie in the window on this day, by start. */
  existing: SketchBlock[];
  /** The calendar's all-day events covering this day (their titles). */
  allDay: string[];
};

const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** The local days a draft's proposals start on, in order, without repeats. */
export function draftDaysOf(events: readonly ProposedEventDto[], timeZone: string): LocalDate[] {
  return [...new Set(events.map((e) => localDateOf(new Date(e.startAt), timeZone)))].sort();
}

/** One timed event as a block on `date`, or null when no part of it lies on that day. */
function blockOn(
  e: { title: string; goalId: string | null; startAt: string; endAt: string },
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
  return { title: e.title, goalId: e.goalId, startMin, endMin, startTime, endTime, endsNextDay: endDay > startDay, startsBefore };
}

/**
 * The days of a draft with their columns. `calendar` are the calendar's events around it (empty for a
 * draft that is not open: then only the proposals are drawn).
 */
export function sketchDraft(
  events: readonly ProposedEventDto[],
  calendar: readonly EventDto[],
  timeZone: string,
): SketchDay[] {
  return draftDaysOf(events, timeZone).map((date) => {
    const proposals = events
      .filter((e) => localDateOf(new Date(e.startAt), timeZone) === date)
      .map((e) => blockOn(e, date, timeZone))
      .filter((b): b is SketchBlock => b !== null)
      .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
    const first = Math.min(...proposals.map((p) => p.startMin));
    const last = Math.max(...proposals.map((p) => p.endMin));
    const startMin = Math.max(0, Math.floor(first / 60) * 60 - 60);
    const endMin = Math.min(DAY_MIN, Math.ceil(last / 60) * 60 + 60);
    const hours: number[] = [];
    for (let m = startMin; m <= endMin; m += 60) hours.push(m);

    const existing = calendar
      .filter((e) => !e.allDay && e.startAt && e.endAt)
      .map((e) => blockOn({ title: e.title, goalId: e.goalId, startAt: e.startAt!, endAt: e.endAt! }, date, timeZone))
      .filter((b): b is SketchBlock => b !== null && b.endMin > startMin && b.startMin < endMin)
      .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
    const allDay = calendar
      .filter((e) => e.allDay && e.firstDay && e.lastDay && e.firstDay <= date && e.lastDay >= date)
      .map((e) => e.title);

    return { date, startMin, endMin, hours, proposals, existing, allDay };
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
