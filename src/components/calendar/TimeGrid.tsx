"use client";

// The day and week views as a time grid, in the prototype's layout: an hour axis, one or seven day
// columns (the week with weekday and date over each, today in red, a click opens that day), events as
// blocks placed by start and length, and the current-time line. Layout maths: src/lib/events/grid.ts.
//
// Dragging as in the prototype (spec 15; maths in src/lib/events/drag.ts): with a mouse or pen, a drag
// on empty space creates an event (snapped to 15 minutes, a dashed preview, Escape cancels, the grid
// scrolls near its edges), a drag on a block moves it (also to another day of the week) and a drag on
// its bottom edge changes its end. Touch only taps. A plain click on empty space suggests one hour.
// What a drop means is decided by the calendar (CalendarView) and, in the end, by the server.
//
// For screen readers and the keyboard, each day is a labelled list of its events in time order,
// and each event is a button whose name says title, day, time and marks. The hour axis, the lines
// and the empty slots are decoration. Everything a drag does can be done in the editor too.
//
// Spec 53 (from spec 29): other people's shared calendars, read only, on the right part of a day column
// (the viewer's own blocks keep the left part, and only on days that have shared blocks). They never
// take part in dragging, creating or the overlap marks (R10, R57).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { blockBox, clampHourPx, HOUR_PX, hourMarks, isBeforeGrid, minuteToPx, rangeHeight, type GridRange, type Placed } from "@/lib/events/grid";
import {
  canDrag,
  clickSpan,
  columnIndexAt,
  createSpan,
  exceedsThreshold,
  minuteAtY,
  moveSpan,
  resizeSpan,
  type Span,
} from "@/lib/events/drag";
import type { AllDayEvent, CalendarEvent, WeekDay, WeekEvent } from "@/lib/events/types";
import { CalendarDays, TriangleAlert, Users } from "lucide-react";
import { NotSentIcon } from "@/components/ui/icons";
import { goalColor } from "@/lib/goals/colors";
import type { GoalLook } from "@/lib/goals/style";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { fmtDateLong, fmtHour, fmtRange, fmtTime, type TimeFormat } from "@/lib/time/display";
import { dayParts } from "@/lib/time/zoned";
import { todoCountText } from "@/lib/todos/types";
import { guestCountText } from "@/lib/events/guests";
import { travelBlock, type TravelBlock } from "@/lib/travel/blocks";
import type { TravelAnswer } from "@/lib/travel/types";
import type { SharedAllDayItem, SharedBlock } from "@/lib/shares/place";
import { anchorOf, pointAnchor, type Anchor } from "./FloatingPanel";
import { SharedAllDayChip, SharedBlockView, type OpenShared } from "./Shared";

/** What the grid and the event editor need of a goal: its name, colour and icon. */
export type GoalLabel = { id: string; title: string; look: GoalLook };

type Props = {
  goals: GoalLabel[];
  days: WeekDay[];
  placed: Placed[][];
  range: GridRange;
  /** Minutes after midnight now, if today is in this week. */
  nowMin: number | null;
  /** On phones only this day's column is shown (the day strip above chooses it). */
  selectedDay: string;
  /** Weekday and date over the grid, each a link to that day (wider screens; phones have the day strip). */
  dayHref?: (date: string) => string;
  /** The day view: the week's seven dates to show over its one column, and today, so its head matches the week view's. */
  weekDates?: string[];
  /** The day view: the all-day events of its whole week (for the height of the all-day row). */
  weekAllDay?: AllDayEvent[];
  today?: string;
  /** Events whose save is still running: they cannot be dragged until it is done. */
  pending?: ReadonlySet<string>;
  onOpenEvent: (event: CalendarEvent, anchor: Anchor) => void;
  /** A click or a drag on empty space: the new event's day and minutes, and where the pointer was. */
  onCreate: (date: string, span: Span, anchor: Anchor) => void;
  /** A block was dropped somewhere else (moved, or its end dragged). */
  onDrop?: (event: WeekEvent, date: string, span: Span, anchor: Anchor) => void;
  /** R27: the travel answers by event id; an event with a time to leave gets a dashed block before it. */
  travel?: Readonly<Record<string, TravelAnswer>>;
  /** A click on a free spot of a day in the all-day row: a new all-day event on that day. */
  onCreateAllDay?: (date: string, anchor: Anchor) => void;
  /** Two fingers on a trackpad or a touch screen zoom the hours: the new height of one hour. */
  onZoom?: (hourPx: number) => void;
  /** Issue #106: events whose trip runs into another event (they get the overlap mark too). */
  tripWarned?: ReadonlySet<string>;
  /**
   * Spec 53: other people's shared calendars, per shown day (read only, never dragged or edited; they
   * sit on the right part of a column and leave the viewer's own blocks on the left).
   */
  shared?: SharedBlock[][];
  sharedAllDay?: SharedAllDayItem[][];
  /** The viewer's time zone, for the shared blocks' words. */
  timeZone?: string;
  onOpenShared?: (shared: OpenShared, anchor: Anchor) => void;
};

/** Spec 53: the part of a day column the viewer's own blocks keep when shared blocks are shown on that day. */
const OWN_AREA = 0.62;
const NO_SHARED: SharedBlock[] = [];

type Gesture =
  | { kind: "create"; pointerId: number; dayIndex: number; x: number; y: number; anchorMin: number; active: boolean }
  | { kind: "move"; pointerId: number; block: Placed; dayIndex: number; x: number; y: number; grabMin: number; active: boolean }
  | { kind: "resize"; pointerId: number; block: Placed; dayIndex: number; x: number; y: number; active: boolean };

type Preview = { kind: Gesture["kind"]; dayIndex: number; span: Span; block: Placed | null };

const AUTO_SCROLL_EDGE_PX = 40;
const AUTO_SCROLL_STEP_PX = 12;
const NO_PENDING: ReadonlySet<string> = new Set();

/** Holds on to the pointer; if the browser refuses (the pointer is gone already), the gesture goes on without. */
function capturePointer(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // for example NotFoundError when the pointer is no longer active
  }
}

/** The day columns that are shown (on phones only one is), with their place on screen. */
type Column = { index: number; left: number; right: number; top: number };

function columnRects(body: HTMLElement | null): Column[] {
  if (!body) return [];
  return Array.from(body.querySelectorAll<HTMLElement>("[data-day-col]"), (el, index) => {
    const r = el.getBoundingClientRect();
    return { index, left: r.left, right: r.right, top: r.top, width: r.width };
  })
    .filter((c) => c.width > 0)
    .map(({ index, left, right, top }) => ({ index, left, right, top }));
}

/** The span a gesture covers for the pointer's position, and the column it lands in. */
function spanFor(g: Gesture, x: number, y: number, columns: Column[], range: GridRange): { dayIndex: number; span: Span } | null {
  if (g.kind === "move") {
    const col = columns[columnIndexAt(x, columns)];
    if (!col) return null;
    const current = minuteAtY(y - col.top, range);
    const span = moveSpan({ startMin: g.block.startMin, endMin: g.block.endMin }, current - g.grabMin - g.block.startMin);
    return { dayIndex: col.index, span };
  }
  const col = columns.find((c) => c.index === g.dayIndex);
  if (!col) return null;
  if (g.kind === "create") return { dayIndex: g.dayIndex, span: createSpan(g.anchorMin, minuteAtY(y - col.top, range), range) };
  return { dayIndex: g.dayIndex, span: resizeSpan({ startMin: g.block.startMin, endMin: g.block.endMin }, minuteAtY(y - col.top, range)) };
}

/** Where a span sits in its day column (full width with a small inset). */
function spanStyle(span: Span, range: GridRange) {
  const { top, height } = blockBox(span, range);
  return { top: top + 1, height: height - 2, left: 2, right: 2 };
}

/** The dashed box while creating, or the block's copy while moving or resizing (as in the prototype). */
function PreviewBox({ preview, range, goal }: { preview: Preview; range: GridRange; goal: GoalLabel | undefined }) {
  const { timeFormat } = useDisplay();
  const time = fmtRange(preview.span.startMin, preview.span.endMin, timeFormat);
  const pos = spanStyle(preview.span, range);
  if (preview.kind === "create" || !preview.block) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute z-[5] rounded-lg border-2 border-dashed border-ink/25 bg-ink/[0.04] px-1.5 py-1 text-[11px] tabular text-ink-2"
        style={pos}
      >
        {time}
      </div>
    );
  }
  const colors = goal ? goalColor(goal.look.color).block : "bg-raised border-line-subtle text-ink";
  return (
    <div aria-hidden className={`pointer-events-none absolute z-[5] overflow-hidden rounded-lg border px-1.5 py-1 shadow-float ${colors}`} style={pos}>
      <span className="block truncate text-[11px] font-medium leading-[14px]">{preview.block.event.title}</span>
      <span className="block text-[10px] leading-[13px] tabular opacity-80">{time}</span>
    </div>
  );
}

/** R11 and R26 in words: where the event came from, or that Outlook does not have it yet. */
function outlookWords(event: CalendarEvent): string[] {
  if (event.source === "outlook") return ["from Outlook"];
  return event.notSent ? ["not sent to Outlook"] : [];
}

/** The small marks for Outlook, next to the conflict and done marks. */
function OutlookMark({ event }: { event: CalendarEvent }) {
  if (event.source === "outlook") return <CalendarDays className="size-3 text-ink-3" />;
  if (event.notSent) return <NotSentIcon className="size-3 text-danger" />;
  return null;
}

/** The block's accessible name: everything the block shows, in words. */
function blockLabel(block: Placed, dayLong: string, goal: GoalLabel | undefined, format: TimeFormat, warned: boolean): string {
  const { event } = block;
  const endTime = fmtTime(event.endTime, format);
  const end = event.endDay ? `${endTime} the next day` : endTime;
  const parts = [`${event.title}, ${dayLong}, ${fmtTime(event.startTime, format)} to ${end}`];
  if (goal) parts.push(`goal ${goal.title}`);
  if (warned) parts.push("overlaps another event");
  if (event.status === "done") parts.push("done");
  if (event.todoCount) parts.push(`${event.todosDone ?? 0} of ${event.todoCount} to-dos done`);
  if (event.guests?.length) parts.push(guestCountText(event.guests.length));
  parts.push(...outlookWords(event));
  return parts.join(", ");
}

type BlockProps = {
  block: Placed;
  /** The part of the column the viewer's own blocks use (1, or less when shared blocks are shown). */
  area: number;
  range: GridRange;
  dayLong: string;
  dayIndex: number;
  goal: GoalLabel | undefined;
  draggable: boolean;
  dimmed: boolean;
  /** The overlap mark: a yellow edge and icon (issue #106). */
  warned: boolean;
  onOpen: (detail: number, anchor: Anchor) => void;
  onMoveStart: (e: ReactPointerEvent<HTMLButtonElement>, block: Placed, dayIndex: number) => void;
  onResizeStart: (e: ReactPointerEvent<HTMLSpanElement>, block: Placed, dayIndex: number) => void;
};

/**
 * One event block, with the prototype's marks: done is a small green dot at the bottom right, an
 * Outlook event the calendar icon. Kept from our rules: the conflict edge and icon (R10) and "not sent
 * to Outlook" (R26). A block that may be dragged moves with the pointer; its bottom edge resizes it.
 */
function EventBlock({ block, area, range, dayLong, dayIndex, goal, draggable, dimmed, warned, onOpen, onMoveStart, onResizeStart }: BlockProps) {
  const { event } = block;
  const { timeFormat } = useDisplay();
  // Events of a goal take the goal's colour; others stay neutral. An overlap adds a yellow edge and an icon.
  const colors = goal ? goalColor(goal.look.color).block : "bg-raised border-line-subtle text-ink";
  const { top, height } = blockBox(block, range);
  const done = event.status === "done";
  // As in the prototype: "9 – 10:30am"; the parts of an event past midnight show "…" and "+1".
  const time =
    block.continuesBefore || block.continuesAfter
      ? `${block.continuesBefore ? "…" : fmtTime(event.startTime, timeFormat)} – ${fmtTime(event.endTime, timeFormat)}${block.continuesAfter ? "+1" : ""}`
      : fmtRange(event.startTime, event.endTime, timeFormat);

  return (
    <button
      type="button"
      data-event-id={event.id}
      onPointerDown={draggable ? (e) => onMoveStart(e, block, dayIndex) : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(e.detail, anchorOf(e.currentTarget));
      }}
      aria-label={blockLabel(block, dayLong, goal, timeFormat, warned)}
      // The part after midnight repeats an event already in the list: mouse only, not a second tab stop.
      tabIndex={block.continuesBefore ? -1 : undefined}
      aria-hidden={block.continuesBefore || undefined}
      style={{
        top: top + 1,
        height: height - 2,
        left: `calc(${(block.lane / block.lanes) * area * 100}% + 2px)`,
        width: `calc(${(100 * area) / block.lanes}% - 4px)`,
      }}
      className={`pointer-events-auto absolute z-[2] overflow-hidden rounded-lg border px-1.5 py-1 text-left transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${
        colors
      } ${warned ? "border-l-[3px] border-l-warning" : ""} ${draggable ? "cursor-grab" : ""} ${dimmed ? "opacity-40" : ""}`}
    >
      <span
        // Whole words only: two lines when there is room, otherwise one line cut with an ellipsis.
        // The button's accessible name carries the full title.
        className={`block pr-4 text-[11px] font-medium leading-[14px] ${height >= 40 && block.lanes === 1 ? "line-clamp-2" : "truncate"}`}
      >
        {event.title}
      </span>
      {height >= 44 && <span className="block truncate text-[10px] leading-[13px] tabular opacity-80">{time}</span>}
      {height >= 72 && event.location && <span className="block truncate pr-3 text-[10px] opacity-80">{event.location}</span>}
      {(warned || event.source === "outlook" || event.notSent) && (
        <span className="absolute right-1 top-1 flex items-center gap-0.5">
          <OutlookMark event={event} />
          {warned && <TriangleAlert className="size-3 text-warning" />}
        </span>
      )}
      {/* As in the prototype: the to-dos' count ("2/3") when the block has room under title and time, else the done dot. */}
      {event.todoCount && height >= 68 ? (
        <span className="absolute bottom-1 right-1 text-[10px] tabular opacity-80">{todoCountText(event.todosDone ?? 0, event.todoCount)}</span>
      ) : (
        done && <span className="absolute bottom-1 right-1 block size-1.5 rounded-full bg-success" />
      )}
      {/* Spec 24: a small people icon with the number of guests, when the block is tall enough. */}
      {event.guests?.length && height >= (event.location ? 88 : 68) ? (
        <span aria-hidden className="absolute bottom-1 left-1.5 flex items-center gap-0.5 text-[10px] tabular opacity-80">
          <Users className="size-3" strokeWidth={2} />
          {event.guests.length}
        </span>
      ) : null}
      {draggable && (
        <span aria-hidden onPointerDown={(e) => onResizeStart(e, block, dayIndex)} className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" />
      )}
    </button>
  );
}

const TRAVEL_BY: Record<TravelBlock["mode"], string> = { driving: "by car", cycling: "by bike", walking: "on foot", transit: "by public transport" };

/**
 * R27: the trip to an event, drawn as a dashed, striped block from the time to leave to the event's start,
 * in the event's lane. Only a picture: clicks go through to the grid, and the event's editor says it in words.
 */
function TravelBox({ trip, block, range, area }: { trip: TravelBlock; block: Placed; range: GridRange; area: number }) {
  const { timeFormat } = useDisplay();
  if (trip.toMin <= range.startMin) return null;
  const top = minuteToPx(Math.max(trip.fromMin, range.startMin), range);
  const height = minuteToPx(trip.toMin, range) - top;
  if (height < 4) return null;
  const leave = fmtTime(trip.toMin - trip.totalMin, timeFormat);
  return (
    <div
      aria-hidden
      data-travel-for={block.event.id}
      className="pointer-events-none absolute z-[1] overflow-hidden rounded-lg border border-dashed border-ink-3/70 px-1.5 text-ink-2"
      style={{
        top: top + 1,
        height: height - 1,
        left: `calc(${(block.lane / block.lanes) * area * 100}% + 2px)`,
        width: `calc(${(100 * area) / block.lanes}% - 4px)`,
        backgroundImage: "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, currentColor 9%, transparent) 6px 7px)",
      }}
    >
      {height >= 16 && (
        <span className="block truncate pt-0.5 text-[10px] leading-[12px]">
          Leave {leave}
        </span>
      )}
      {height >= 30 && <span className="block truncate text-[10px] leading-[12px] opacity-80">{`${fmtMinutesShort(trip.tripMin)} ${TRAVEL_BY[trip.mode]}`}</span>}
    </div>
  );
}

/** 25 → "25m", 95 → "1h 35m". */
function fmtMinutesShort(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "Exam week, all day, Monday 16 November to Friday 20 November". */
function allDayLabel(event: AllDayEvent): string {
  const first = fmtDateLong(event.firstDay);
  const days = event.lastDay === event.firstDay ? first : `${first} to ${fmtDateLong(event.lastDay)}`;
  return [`${event.title}, all day, ${days}`, ...outlookWords(event)].join(", ");
}

const allDayClass =
  "block w-full truncate rounded-md border border-line bg-raised px-1.5 py-0.5 text-left text-[11px] font-medium leading-[15px] text-ink hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40";

type AllDayRowProps = {
  days: WeekDay[];
  selectedDay: string;
  onOpenEvent: (event: CalendarEvent, anchor: Anchor) => void;
  /** The day view: its week's dates and all-day events, so the row is as tall as in the week view. */
  weekDates?: string[];
  weekAllDay?: AllDayEvent[];
  /** A click on a free spot of a day in this row: a new all-day event on that day. */
  onCreateAllDay?: (date: string, anchor: Anchor) => void;
};

/** Height of one all-day bar (border, padding and line of `allDayClass`), the gap between bars, and the row's padding. */
const ALL_DAY_BAR_PX = 21;
const ALL_DAY_GAP_PX = 2;
const ALL_DAY_PAD_PX = 8;

/**
 * How many rows the week view needs for these all-day bars. Same order and the same first fit as the
 * week's grid (`row dense`): each bar goes into the first row whose days are still free.
 */
export function allDayRowCount(events: readonly AllDayEvent[], dates: readonly string[]): number {
  if (dates.length === 0) return 0;
  // In the week's order: by the first shown day each event covers, then as the server sent them.
  const ordered = [...new Map(dates.flatMap((date) => events.filter((e) => e.firstDay <= date && date <= e.lastDay)).map((e) => [e.id, e])).values()];
  const end = dates.length - 1;
  const rows: boolean[][] = [];
  for (const event of ordered) {
    const first = event.firstDay < dates[0] ? 0 : dates.indexOf(event.firstDay);
    const last = event.lastDay > dates[end] ? end : dates.indexOf(event.lastDay);
    let row = rows.findIndex((taken) => taken.slice(first, last + 1).every((t) => !t));
    if (row === -1) row = rows.push(dates.map(() => false)) - 1;
    for (let i = first; i <= last; i++) rows[row][i] = true;
  }
  return rows.length;
}

/**
 * All-day events (R29) in a row above the hours: on wider screens one bar per event across its days
 * of this week, on phones the chosen day's events. Each event is one button with its days in words.
 * On wider screens the row is there even without all-day events, so a new one can be added with a click;
 * on phones only when the chosen day has some.
 */
function AllDayRow({ days, selectedDay, onOpenEvent, weekDates, weekAllDay, onCreateAllDay }: AllDayRowProps) {
  const events = [...new Map(days.flatMap((d) => d.allDay).map((e) => [e.id, e])).values()];
  // On wider screens the row is always there (a click on it adds an all-day event), at least one bar
  // tall; the day view keeps the week's height, even when the shown day has fewer bars or none.
  const weekRows = weekDates && weekAllDay ? allDayRowCount(weekAllDay, weekDates) : 0;
  const rows = Math.max(1, weekRows);
  const minHeight = rows * ALL_DAY_BAR_PX + (rows - 1) * ALL_DAY_GAP_PX + ALL_DAY_PAD_PX;
  const chosen = days.find((d) => d.date === selectedDay)?.allDay ?? [];
  const columnOf = (date: string) => days.findIndex((d) => d.date === date);

  return (
    <section aria-label="All day" className={`${chosen.length ? "flex" : "hidden"} border-b border-line-subtle md:flex`}>
      <div aria-hidden className="w-[52px] shrink-0 pt-1.5 pr-2 text-right text-[10px] leading-[12px] font-medium text-ink-2">
        All day
      </div>
      {/* Phones: the chosen day only. */}
      <ul className="flex min-w-0 flex-1 flex-col gap-0.5 border-l border-line-subtle p-1 md:hidden">
        {chosen.map((event) => (
          <li key={event.id}>
            <button type="button" aria-label={allDayLabel(event)} onClick={(e) => onOpenEvent(event, anchorOf(e.currentTarget))} className={allDayClass}>
              <span className="flex items-center gap-1">
                <span className="min-w-0 truncate">{event.title}</span>
                <OutlookMark event={event} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {/* Wider screens: bars across the days, packed into as few rows as fit. A click on a free spot
          of a day starts a new all-day event on it (mouse only, like a click on free time below;
          "New event" does the same for the keyboard). */}
      <div className="relative hidden min-w-0 flex-1 border-l border-line-subtle md:block">
        {onCreateAllDay && (
          <div aria-hidden className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((day) => (
              <div
                key={day.date}
                data-all-day-slot={day.date}
                title="New all-day event"
                onClick={(e) => onCreateAllDay(day.date, pointAnchor(e.clientX, e.clientY))}
                className="cursor-pointer transition-colors hover:bg-raised/60"
              />
            ))}
          </div>
        )}
        <ul
          className="pointer-events-none relative grid min-w-0 content-start gap-y-0.5 py-1 [grid-auto-flow:row_dense]"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, minHeight }}
        >
          {events.map((event) => {
            const end = days.length - 1;
            const first = event.firstDay < days[0].date ? 0 : columnOf(event.firstDay);
            const last = event.lastDay > days[end].date ? end : columnOf(event.lastDay);
            return (
              <li key={event.id} style={{ gridColumn: `${first + 1} / ${last + 2}` }} className="pointer-events-auto min-w-0 px-0.5">
                <button type="button" aria-label={allDayLabel(event)} onClick={(e) => onOpenEvent(event, anchorOf(e.currentTarget))} className={allDayClass}>
                  <span className="flex items-center gap-1">
                    <span className="min-w-0 truncate">{event.firstDay < days[0].date ? `… ${event.title}` : event.title}</span>
                    <OutlookMark event={event} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/**
 * Spec 53 (from spec 29): other people's all-day events, under the viewer's own all-day row, one small
 * chip in the person's colour per event and day (on phones the chosen day only). Read only.
 */
function SharedAllDayRow({
  days,
  items,
  selectedDay,
  onOpen,
}: {
  days: WeekDay[];
  items: SharedAllDayItem[][];
  selectedDay: string;
  onOpen: (shared: OpenShared, anchor: Anchor) => void;
}) {
  if (!items.some((list) => list.length > 0)) return null;
  const chosen = days.findIndex((d) => d.date === selectedDay);
  return (
    <section aria-label="Shared, all day" className={`${items[chosen]?.length ? "flex" : "hidden"} border-b border-line-subtle md:flex`}>
      <div aria-hidden className="w-[52px] shrink-0 pt-1.5 pr-2 text-right text-[10px] leading-[12px] font-medium text-ink-3">
        Shared
      </div>
      {days.map((day, i) => (
        <ul key={day.date} className={`${day.date === selectedDay ? "flex" : "hidden"} min-w-0 flex-1 flex-col gap-0.5 border-l border-line-subtle p-1 md:flex`}>
          {(items[i] ?? []).map((item) => (
            <li key={item.key} className="min-w-0">
              <SharedAllDayChip item={item} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

/**
 * The smallest hour height: the visible area below the dates and the all-day row, shared by the shown
 * hours. Rounded down, so the hours never come out a fraction of a pixel too tall and start to scroll.
 */
function fitHourPx(scroll: HTMLElement, body: HTMLElement, hoursShown: number): number {
  return hoursShown > 0 ? Math.max(0, Math.floor(((scroll.clientHeight - body.offsetTop) / hoursShown) * 100) / 100) : 0;
}

export function TimeGrid({
  goals,
  days,
  placed,
  range: askedRange,
  nowMin,
  selectedDay,
  dayHref,
  weekDates,
  weekAllDay,
  today,
  pending = NO_PENDING,
  onOpenEvent,
  onCreate,
  onDrop,
  travel,
  onCreateAllDay,
  onZoom,
  tripWarned,
  shared,
  sharedAllDay,
  timeZone = "UTC",
  onOpenShared,
}: Props) {
  const { timeFormat } = useDisplay();
  const goalOf = (id: string | null) => (id ? goals.find((g) => g.id === id) : undefined);
  // The hours are never shorter than the visible area needs: zoomed out all the way, the last hour
  // ends at the bottom edge, with no empty space below it (measured once the grid is on screen).
  const [fitPx, setFitPx] = useState(0);
  const range = useMemo(
    () => ({ ...askedRange, hourPx: Math.max(askedRange.hourPx ?? HOUR_PX, fitPx) }),
    [askedRange, fitPx],
  );
  const height = rangeHeight(range);
  const hours = hourMarks(range);
  // After-midnight parts that end before the first visible hour: shown as strips above the grid.
  const early = placed.map((blocks) => blocks.filter((b) => isBeforeGrid(b, range)));
  const hasEarly = early.some((blocks) => blocks.length > 0);
  const showNow = nowMin !== null && nowMin >= range.startMin && nowMin < range.endMin;

  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  // Set after a finished drag or an Escape, reset by the next pointer-down: the click that follows is swallowed.
  const suppressClickRef = useRef(false);
  // Set on a pointer-down on empty space while a panel or dialog is open: that click only closes it.
  const dismissClickRef = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const hasPreview = preview !== null;

  // Two-finger zoom. The time under the fingers stays where it is, so zooming feels anchored.
  // Refs, because one pinch sends many events before React has drawn the new height.
  const hourPx = range.hourPx;
  const hoursShown = (askedRange.endMin - askedRange.startMin) / 60;
  const zoomRef = useRef({ hourPx, hoursShown, startMin: range.startMin, onZoom });
  // The minute that was under the fingers and its height in the visible grid, until the new height is drawn.
  const zoomAnchorRef = useRef<{ minute: number; y: number } | null>(null);

  useLayoutEffect(() => {
    zoomRef.current = { hourPx, hoursShown, startMin: range.startMin, onZoom };
    const anchor = zoomAnchorRef.current;
    const sc = scrollRef.current;
    const body = bodyRef.current;
    zoomAnchorRef.current = null;
    if (!anchor || !sc || !body) return;
    sc.scrollTop = body.offsetTop + ((anchor.minute - range.startMin) / 60) * hourPx - anchor.y;
  }, [hourPx, hoursShown, range.startMin, onZoom]);

  // Keeps the smallest hour height up to date when the window or the head above the hours changes size.
  useEffect(() => {
    const sc = scrollRef.current;
    const body = bodyRef.current;
    if (!sc || !body || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setFitPx(fitHourPx(sc, body, hoursShown)));
    observer.observe(sc);
    const head = sc.querySelector("[data-grid-head]");
    if (head) observer.observe(head);
    return () => observer.disconnect();
  }, [hoursShown, hasEarly]);

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const zoomTo = (clientY: number, next: number) => {
      const z = zoomRef.current;
      const body = bodyRef.current;
      if (!body) return;
      // Never further out than the hours that fill the visible area (measured now, so it is always current).
      const px = Math.max(clampHourPx(next), fitHourPx(sc, body, z.hoursShown));
      if (!z.onZoom || Math.abs(px - z.hourPx) < 0.01) return;
      if (!zoomAnchorRef.current) {
        const y = clientY - sc.getBoundingClientRect().top;
        zoomAnchorRef.current = { minute: z.startMin + ((sc.scrollTop + y - body.offsetTop) / z.hourPx) * 60, y };
      }
      z.hourPx = px;
      z.onZoom(px);
    };
    // Trackpad pinch (Chrome, Edge, Firefox): a wheel event with the Control key set.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(e.clientY, zoomRef.current.hourPx * Math.exp(-e.deltaY * 0.01));
    };
    // Trackpad pinch in Safari: gesture events with a scale since the pinch began.
    type SafariGesture = UIEvent & { scale: number; clientY: number };
    let gestureStart = 0;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStart = zoomRef.current.hourPx;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      zoomTo((e as SafariGesture).clientY, gestureStart * (e as SafariGesture).scale);
    };
    // Two fingers on a touch screen: the hour height follows the distance between them.
    let pinch: { distance: number; hourPx: number } | null = null;
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      pinch = e.touches.length === 2 ? { distance: spread(e.touches), hourPx: zoomRef.current.hourPx } : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const middle = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoomTo(middle, pinch.hourPx * (spread(e.touches) / pinch.distance));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    sc.addEventListener("wheel", onWheel, { passive: false });
    sc.addEventListener("gesturestart", onGestureStart);
    sc.addEventListener("gesturechange", onGestureChange);
    sc.addEventListener("touchstart", onTouchStart, { passive: true });
    sc.addEventListener("touchmove", onTouchMove, { passive: false });
    sc.addEventListener("touchend", onTouchEnd);
    sc.addEventListener("touchcancel", onTouchEnd);
    return () => {
      sc.removeEventListener("wheel", onWheel);
      sc.removeEventListener("gesturestart", onGestureStart);
      sc.removeEventListener("gesturechange", onGestureChange);
      sc.removeEventListener("touchstart", onTouchStart);
      sc.removeEventListener("touchmove", onTouchMove);
      sc.removeEventListener("touchend", onTouchEnd);
      sc.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);
  const movingId = preview?.block ? preview.block.event.id : null;

  // Escape cancels a running gesture (only while a preview is shown).
  useEffect(() => {
    if (!hasPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      gestureRef.current = null;
      document.body.style.cursor = "";
      setPreview(null);
      suppressClickRef.current = true;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPreview]);

  const beginCreate = (e: ReactPointerEvent<HTMLDivElement>, dayIndex: number) => {
    if (e.button !== 0 || e.pointerType === "touch" || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    gestureRef.current = { kind: "create", pointerId: e.pointerId, dayIndex, x: e.clientX, y: e.clientY, anchorMin: minuteAtY(e.clientY - rect.top, range), active: false };
    capturePointer(e.currentTarget, e.pointerId);
  };

  const beginMove = (e: ReactPointerEvent<HTMLButtonElement>, block: Placed, dayIndex: number) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    e.stopPropagation();
    const col = e.currentTarget.closest<HTMLElement>("[data-day-col]");
    if (!col) return;
    const rect = col.getBoundingClientRect();
    gestureRef.current = {
      kind: "move",
      pointerId: e.pointerId,
      block,
      dayIndex,
      x: e.clientX,
      y: e.clientY,
      grabMin: minuteAtY(e.clientY - rect.top, range) - block.startMin,
      active: false,
    };
    capturePointer(e.currentTarget, e.pointerId);
  };

  const beginResize = (e: ReactPointerEvent<HTMLSpanElement>, block: Placed, dayIndex: number) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    e.stopPropagation();
    gestureRef.current = { kind: "resize", pointerId: e.pointerId, block, dayIndex, x: e.clientX, y: e.clientY, active: false };
    capturePointer(e.currentTarget, e.pointerId);
  };

  const onBodyPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (!g.active) {
      if (!exceedsThreshold(e.clientX - g.x, e.clientY - g.y)) return;
      if (g.kind === "move") document.body.style.cursor = "grabbing";
      if (g.kind === "resize") document.body.style.cursor = "ns-resize";
      gestureRef.current = { ...g, active: true };
    }
    // Near the top or bottom edge the grid scrolls on.
    const sc = scrollRef.current;
    if (sc) {
      const box = sc.getBoundingClientRect();
      if (e.clientY < box.top + AUTO_SCROLL_EDGE_PX) sc.scrollTop -= AUTO_SCROLL_STEP_PX;
      else if (e.clientY > box.bottom - AUTO_SCROLL_EDGE_PX) sc.scrollTop += AUTO_SCROLL_STEP_PX;
    }
    const current = gestureRef.current;
    if (!current) return;
    const result = spanFor(current, e.clientX, e.clientY, columnRects(bodyRef.current), range);
    if (!result) return;
    setPreview({ kind: current.kind, dayIndex: result.dayIndex, span: result.span, block: current.kind === "create" ? null : current.block });
  };

  const onBodyPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    document.body.style.cursor = "";
    if (!g.active) {
      setPreview(null);
      return; // a plain click: the click handler runs
    }
    const result = spanFor(g, e.clientX, e.clientY, columnRects(bodyRef.current), range);
    setPreview(null);
    suppressClickRef.current = true;
    if (!result) return;
    const day = days[result.dayIndex];
    if (!day) return;
    const anchor = pointAnchor(e.clientX, e.clientY);
    if (g.kind === "create") {
      onCreate(day.date, result.span, anchor);
    } else if (g.kind === "move") {
      const changed = day.date !== g.block.event.startLocal.slice(0, 10) || result.span.startMin !== g.block.startMin;
      if (changed) onDrop?.(g.block.event, day.date, result.span, anchor);
    } else if (result.span.endMin !== g.block.endMin) {
      onDrop?.(g.block.event, g.block.event.startLocal.slice(0, 10), result.span, anchor);
    }
  };

  const onBodyPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    document.body.style.cursor = "";
    setPreview(null);
  };

  // A click on a block (also a touch tap). A finished drag swallows its click; keyboard clicks
  // (detail 0) are never swallowed.
  const openBlock = (event: CalendarEvent, detail: number, anchor: Anchor) => {
    if (suppressClickRef.current && detail !== 0) {
      suppressClickRef.current = false;
      return;
    }
    onOpenEvent(event, anchor);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-card border border-line-subtle bg-surface select-none">
      <div
        ref={scrollRef}
        data-grid-scroll
        className="scroll-thin relative min-h-0 flex-1 overflow-y-auto"
        // The browser scrolls with one finger; a pinch with two is ours (zoom), not the page's.
        style={onZoom ? { touchAction: "pan-x pan-y" } : undefined}
        // Runs before the block and column handlers: every new gesture starts with clean click flags.
        onPointerDownCapture={() => {
          suppressClickRef.current = false;
          dismissClickRef.current = false;
        }}
      >
        {/* The dates and the all-day events stay at the top while the hours scroll beneath them. */}
        <div data-grid-head className="sticky top-0 z-20 bg-surface">
          {/* Week: weekday and date over each column, a link to that day (wider screens; phones use the day strip).
              Day: the same seven dates in the same place, the shown day marked, so nothing moves between the two. */}
          {dayHref && (
            <div className="hidden border-b border-line-subtle bg-surface md:flex">
              <div className="w-[52px] shrink-0" />
              {(weekDates ?? days.map((d) => d.date)).map((date) => {
                const parts = dayParts(date);
                const isToday = weekDates ? date === today : days.some((d) => d.date === date && d.isToday);
                const marked = weekDates !== undefined && date === selectedDay;
                return (
                  <Link
                    key={date}
                    href={dayHref(date)}
                    // The week names its links "Open …"; the day view names them as its strip does.
                    aria-label={weekDates ? `${fmtDateLong(date)}${isToday ? ", today" : ""}` : `Open ${fmtDateLong(date)}`}
                    aria-current={marked ? "date" : undefined}
                    className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md py-2 transition hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
                  >
                    <span className="text-[11px] font-medium text-ink-3">{parts.weekday}</span>
                    <span
                      className={`flex size-7 items-center justify-center rounded-full border text-sm font-semibold tabular ${
                        isToday ? "border-transparent bg-today text-white" : marked ? "border-ink text-ink" : "border-transparent text-ink"
                      }`}
                    >
                      {parts.day}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          <AllDayRow days={days} selectedDay={selectedDay} onOpenEvent={onOpenEvent} weekDates={weekDates} weekAllDay={weekAllDay} onCreateAllDay={onCreateAllDay} />
          {sharedAllDay && onOpenShared && <SharedAllDayRow days={days} items={sharedAllDay} selectedDay={selectedDay} onOpen={onOpenShared} />}
        </div>

        {hasEarly && (
          // Mouse only and not read out: each of these events is already listed on the day it starts.
          // On phones the row shows only when the chosen day has such a strip. Dashed, with "until",
          // so it does not read like the solid all-day bars above it.
          <div
            aria-hidden
            className={`${early[days.findIndex((d) => d.date === selectedDay)]?.length ? "flex" : "hidden"} border-b border-line-subtle md:flex`}
          >
            <div className="w-[52px] shrink-0 pt-1.5 pr-2 text-right text-[10px] leading-[12px] text-ink-3">{`Before ${fmtTime(range.startMin, timeFormat)}`}</div>
            {days.map((day, i) => (
              <div key={day.date} className={`${day.date === selectedDay ? "flex" : "hidden"} min-w-0 flex-1 flex-col gap-0.5 border-l border-line-subtle p-1 md:flex`}>
                {early[i].map((block) => (
                  <button
                    key={block.event.id}
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => onOpenEvent(block.event, anchorOf(e.currentTarget))}
                    className="line-clamp-2 rounded-md border border-dashed border-ink-3 bg-raised px-1.5 py-0.5 text-left text-[10px] leading-[13px] text-ink-2"
                  >
                    {`${block.event.title}, until ${fmtTime(block.event.endTime, timeFormat)}`}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div
          ref={bodyRef}
          data-hour-grid
          className="relative flex"
          onPointerMove={onBodyPointerMove}
          onPointerUp={onBodyPointerUp}
          onPointerCancel={onBodyPointerCancel}
        >
          {/* Hour axis. */}
          <div aria-hidden className="relative w-[52px] shrink-0" style={{ height }}>
            {hours
              // The red time label replaces an hour label right next to it.
              .filter((m) => !showNow || Math.abs(m - (nowMin ?? 0)) > 12)
              .map((m) => (
                <span key={m} className="absolute right-2 text-[11px] tabular text-ink-3" style={{ top: minuteToPx(m, range) + 2 }}>
                  {fmtHour(m / 60, timeFormat)}
                </span>
              ))}
            {showNow && (
              <span
                className="absolute right-1 -translate-y-1/2 rounded bg-today px-1 text-[10px] font-medium tabular text-white"
                style={{ top: minuteToPx(nowMin ?? 0, range) }}
              >
                {fmtTime(nowMin ?? 0, timeFormat)}
              </span>
            )}
          </div>

          {days.map((day, i) => {
            const parts = { long: fmtDateLong(day.date) };
            const blocks = placed[i];
            const listed = blocks.filter((b) => !b.continuesBefore);
            // Spec 53: shared blocks of this day within the shown hours; only then do the own blocks narrow.
            const sharedHere = onOpenShared ? (shared?.[i] ?? NO_SHARED).filter((b) => b.endMin > range.startMin && b.startMin < range.endMin) : NO_SHARED;
            const area = sharedHere.length > 0 ? OWN_AREA : 1;
            return (
              <section
                key={day.date}
                aria-label={`${parts.long}${day.isToday ? ", today" : ""}`}
                data-day-col
                className={`${day.date === selectedDay ? "block" : "hidden"} relative min-w-0 flex-1 border-l border-line-subtle md:block ${
                  day.isToday ? "bg-raised/40" : ""
                }`}
                style={{ height }}
              >
                {/* The empty area: lines; a click suggests an hour there, a drag the dragged time. */}
                <div
                  aria-hidden
                  className="absolute inset-0"
                  onPointerDown={(e) => {
                    dismissClickRef.current = document.querySelector('[role="dialog"],dialog[open]') !== null;
                    beginCreate(e, i);
                  }}
                  onClick={(e) => {
                    if (dismissClickRef.current) {
                      dismissClickRef.current = false;
                      return;
                    }
                    if (suppressClickRef.current && e.detail !== 0) {
                      suppressClickRef.current = false;
                      return;
                    }
                    if (e.target !== e.currentTarget) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    onCreate(day.date, clickSpan(minuteAtY(e.clientY - rect.top, range), range), pointAnchor(e.clientX, e.clientY));
                  }}
                >
                  {hours.map((m) => (
                    <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-line-subtle" style={{ top: minuteToPx(m, range) }} />
                  ))}
                </div>
                {/* Over the blocks, so the time is readable inside an event too; under a block being dragged. */}
                {day.isToday && showNow && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[3] h-px bg-today" style={{ top: minuteToPx(nowMin ?? 0, range) }}>
                    <span className="absolute -left-[3px] -top-[3px] size-[7px] rounded-full bg-today" />
                  </div>
                )}
                {listed.length === 0 && <p className="sr-only">No events</p>}
                {/* R27: the trips, under the event blocks, so an event that overlaps a trip stays on top. */}
                {travel &&
                  blocks.map((block) => {
                    const trip = travelBlock(block.event, block.startMin, block.continuesBefore, travel[block.event.id]);
                    return trip && <TravelBox key={`travel-${block.event.id}`} trip={trip} block={block} range={range} area={area} />;
                  })}
                {/* Spec 53: others' blocks, under the viewer's own. Only a details block takes a click. */}
                {sharedHere.length > 0 && onOpenShared && (
                  <ul aria-label="Shared calendars" className="pointer-events-none absolute inset-0">
                    {sharedHere.map((block) => (
                      <li key={`${block.key}-${block.continuesBefore ? "after" : "start"}`}>
                        <SharedBlockView block={block} range={range} left={OWN_AREA} width={1 - OWN_AREA} timeZone={timeZone} onOpen={onOpenShared} />
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="pointer-events-none absolute inset-0">
                  {blocks.filter((block) => !isBeforeGrid(block, range)).map((block) => (
                    <li key={`${block.event.id}-${block.continuesBefore ? "after" : "start"}`}>
                      <EventBlock
                        block={block}
                        area={area}
                        range={range}
                        dayLong={parts.long}
                        dayIndex={i}
                        goal={goalOf(block.event.goalId)}
                        draggable={onDrop !== undefined && canDrag(block, pending)}
                        dimmed={movingId === block.event.id}
                        warned={block.event.conflict || (tripWarned?.has(block.event.id) ?? false)}
                        onOpen={(detail, anchor) => openBlock(block.event, detail, anchor)}
                        onMoveStart={beginMove}
                        onResizeStart={beginResize}
                      />
                    </li>
                  ))}
                </ul>
                {preview && preview.dayIndex === i && (
                  <PreviewBox preview={preview} range={range} goal={preview.block ? goalOf(preview.block.event.goalId) : undefined} />
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
