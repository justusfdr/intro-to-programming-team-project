// The geometry of a draft drawn as its day (spec 19, step B): which days a draft has, which hours each
// day's small column shows, and where every block sits. Pure functions, no React. Times come in as ISO
// strings in UTC and are placed by their wall-clock time in the user's time zone.
// A proposal belongs to the day it starts (R2), also when it runs past midnight. The column runs from
// the hour before the first proposal to the hour after the last one; the calendar's own events are
// cut to that window.
// Spec 20: a draft may also move and delete existing events. A moved event is drawn on the day of its
// new start, like a proposal, and its old place as an outline on the day it started; a deleted event is
// drawn at its place, struck through. Both stop being drawn as the calendar's own events.
// Spec 22: the open draft's blocks can be dragged. Its column then shows the whole visible day (the
// settings' day_start_hour to day_end_hour, widened to everything it has to show), so there is room
// to drag; each block it creates or moves carries a key to find it again ("new:0", "move:<id>").
// Spec 23: a draft may add to-dos to events already in the calendar. Such an event is drawn as the
// calendar's own (pale, never dragged) with a mark "+2 to-dos", on the day it starts (an all-day event
// among the all-day chips, on its first day), also when the draft has nothing else on that day. An
// event the draft also moves carries the mark on its moved block instead.
import type { EventDto } from "@/lib/events/types";
import { localDateOf, localTimeOf, type LocalDate } from "@/lib/time/zoned";
import type { DraftChangeDto, DraftTodosDto, ProposedEventDto } from "./types";

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
  /** Spec 22: which block of the draft this is, for a new event ("new:0") or a moved one ("move:<event id>"). */
  key?: string;
  /** Spec 23: the to-dos the draft adds to this existing event (left out when none). */
  addedTodos?: string[];
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
  /**
   * Spec 23: existing timed events on this day that the draft adds to-dos to and does not move, drawn as
   * the calendar's own with the mark (`addedTodos` is set on each).
   */
  withTodos: SketchBlock[];
  /** Spec 23: existing all-day events (first day on this day) the draft adds to-dos to: title and the to-dos. */
  allDayTodos: { title: string; addedTodos: string[] }[];
};

/** "+2 to-dos": the mark on an event the draft adds to-dos to (spec 23). */
export function addedTodosText(count: number): string {
  return `+${count} ${count === 1 ? "to-do" : "to-dos"}`;
}

/** The day an existing event with new to-dos is shown on (spec 23): a timed event's start, an all-day event's first day. */
function additionDay(a: DraftTodosDto, timeZone: string): LocalDate | null {
  if (a.startAt) return localDateOf(new Date(a.startAt), timeZone);
  return a.firstDay;
}

const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * The local days a draft's proposals start on, in order, without repeats; with changes (spec 20) also
 * a moved event's old and new day and a deleted event's day; with to-dos for existing events (spec 23)
 * the day each such event is shown on (an event the draft also moves is shown on its moved block).
 */
export function draftDaysOf(
  events: readonly ProposedEventDto[],
  timeZone: string,
  changes: readonly DraftChangeDto[] = [],
  added: readonly DraftTodosDto[] = [],
): LocalDate[] {
  const starts = [
    ...events.map((e) => e.startAt),
    ...changes.flatMap((c) => (c.startAt ? [c.oldStartAt, c.startAt] : [c.oldStartAt])),
  ];
  const movedIds = new Set(changes.filter((c) => c.kind === "move").map((c) => c.eventId));
  const addedDays = added.filter((a) => !movedIds.has(a.eventId)).flatMap((a) => {
    const day = additionDay(a, timeZone);
    return day ? [day] : [];
  });
  return [...new Set([...starts.map((start) => localDateOf(new Date(start), timeZone)), ...addedDays])].sort();
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
  // An event that is over before this day starts has no part on it (it used to be drawn from midnight).
  if (endDay < date) return null;
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
  /** Spec 22, the open draft: the visible hours of the settings; the column shows at least these. */
  visible?: { startHour: number; endHour: number },
  /** Spec 23: the to-dos the draft adds to existing events. */
  added: readonly DraftTodosDto[] = [],
): SketchDay[] {
  const startDay = (iso: string) => localDateOf(new Date(iso), timeZone);
  const changedIds = new Set(changes.map((c) => c.eventId));
  const old = (c: DraftChangeDto) => ({ title: c.title, goalId: c.goalId, startAt: c.oldStartAt, endAt: c.oldEndAt });
  const addedTo = new Map(added.map((a) => [a.eventId, a]));
  /** An existing event with new to-dos, as the calendar has it now when it is there, else as the draft saw it. */
  const current = (a: DraftTodosDto) => calendar.find((e) => e.id === a.eventId);

  return draftDaysOf(events, timeZone, changes, added).map((date) => {
    const proposals = events
      .map((e, index) => ({ e, key: `new:${index}` }))
      .filter(({ e }) => startDay(e.startAt) === date)
      .map(({ e, key }) => {
        const block = blockOn(e, date, timeZone);
        return block ? { ...block, key } : null;
      })
      .filter(isBlock)
      .sort(byStart);
    const moved = changes
      .filter((c) => c.kind === "move" && c.startAt && c.endAt && startDay(c.startAt) === date)
      .map((c) => {
        const block = blockOn({ title: c.title, goalId: c.goalId, startAt: c.startAt!, endAt: c.endAt! }, date, timeZone);
        const todos = addedTo.get(c.eventId)?.todos;
        return block
          ? {
              ...block,
              key: `move:${c.eventId}`,
              fromTime: localTimeOf(new Date(c.oldStartAt), timeZone),
              fromDate: startDay(c.oldStartAt),
              ...(todos ? { addedTodos: [...todos] } : {}),
            }
          : null;
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

    // Spec 23: existing events the draft adds to-dos to (and does not move), at their place.
    const withTodos = added
      .filter((a) => !changedIds.has(a.eventId))
      .map((a) => {
        const now = current(a);
        const timed = now ? (!now.allDay && now.startAt && now.endAt ? { startAt: now.startAt, endAt: now.endAt } : null) : a.startAt && a.endAt ? { startAt: a.startAt, endAt: a.endAt } : null;
        if (!timed || startDay(timed.startAt) !== date) return null;
        const block = blockOn({ title: now?.title ?? a.title, goalId: now?.goalId ?? null, ...timed }, date, timeZone);
        return block ? { ...block, addedTodos: [...a.todos] } : null;
      })
      .filter(isBlock)
      .sort(byStart);
    const allDayTodos = added
      .filter((a) => !changedIds.has(a.eventId))
      .flatMap((a) => {
        const now = current(a);
        const firstDay = now ? (now.allDay ? now.firstDay : null) : a.allDay ? a.firstDay : null;
        return firstDay === date ? [{ title: now?.title ?? a.title, addedTodos: [...a.todos] }] : [];
      });

    const drawn = [...proposals, ...moved, ...oldPlaces, ...removed, ...withTodos];
    // A day with nothing timed of the draft (only to-dos for an all-day event): the open draft shows
    // the visible day, any other draft no column (startMin = endMin).
    const first = drawn.length > 0 ? Math.min(...drawn.map((p) => p.startMin)) : visible ? visible.startHour * 60 : 0;
    const last = drawn.length > 0 ? Math.max(...drawn.map((p) => p.endMin)) : visible ? visible.endHour * 60 : 0;
    const startMin =
      drawn.length === 0 && !visible
        ? 0
        : visible
          ? Math.max(0, Math.min(visible.startHour * 60, Math.floor(first / 60) * 60))
          : Math.max(0, Math.floor(first / 60) * 60 - 60);
    const endMin =
      drawn.length === 0 && !visible
        ? 0
        : visible
          ? Math.min(DAY_MIN, Math.max(visible.endHour * 60, Math.ceil(last / 60) * 60))
          : Math.min(DAY_MIN, Math.ceil(last / 60) * 60 + 60);
    const hours: number[] = [];
    if (endMin > startMin) for (let m = startMin; m <= endMin; m += 60) hours.push(m);

    const existing = calendar
      .filter((e) => !e.allDay && e.startAt && e.endAt && !changedIds.has(e.id) && !addedTo.has(e.id))
      .map((e) => blockOn({ title: e.title, goalId: e.goalId, startAt: e.startAt!, endAt: e.endAt! }, date, timeZone))
      .filter((b): b is SketchBlock => b !== null && b.endMin > startMin && b.startMin < endMin)
      .sort(byStart);
    const allDay = calendar
      .filter((e) => e.allDay && e.firstDay && e.lastDay && e.firstDay <= date && e.lastDay >= date)
      // Spec 23: an all-day event with new to-dos is shown among allDayTodos on its first day.
      .filter((e) => !(addedTo.has(e.id) && e.firstDay === date))
      .map((e) => e.title);

    return { date, startMin, endMin, hours, proposals, moved, oldPlaces, removed, existing, allDay, withTodos, allDayTodos };
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

/**
 * Spec 22: whether a block of the open draft can be dragged: a new event or a moved event (they carry
 * a key) that ends on the day it starts (as in the calendar, the part after midnight cannot be dragged).
 */
export function canDragBlock(block: SketchBlock): boolean {
  // An end at exactly midnight has nothing on the next day: the block is whole.
  const pastMidnight = block.endsNextDay && block.endTime !== "00:00";
  return block.key !== undefined && !pastMidnight && !block.startsBefore;
}

/**
 * Spec 22: a dragged span kept inside the column's window (the drag maths of src/lib/events/drag.ts
 * keep it inside the day; the column may show less than the whole day). The length stays.
 */
export function keepInWindow(span: { startMin: number; endMin: number }, day: { startMin: number; endMin: number }): { startMin: number; endMin: number } {
  const length = Math.min(span.endMin - span.startMin, day.endMin - day.startMin);
  const startMin = Math.min(Math.max(span.startMin, day.startMin), day.endMin - length);
  return { startMin, endMin: startMin + length };
}
