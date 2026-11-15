"use client";

// The month grid, copied from the first prototype: 6 weeks × 7 days. On wider screens the events are
// rows in the cell ("7:30am Title" with the goal's colour dot, "+2 more"), on phones only dots; a click
// on a cell (or its date) opens that day. The prototype measured the width to choose rows or dots;
// here a container query does it, so the first paint from the server is already right.
// Cells and items: src/lib/events/month.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { buildMonthCells, itemsPerCell, monthRows, splitVisible, type MonthCell, type MonthItem } from "@/lib/events/month";
import type { CalendarEvent, WeekDay, WeekEvent } from "@/lib/events/types";
import { goalColor } from "@/lib/goals/colors";
import { fmtDateLong, fmtDateShort, fmtRange, fmtTime, type TimeFormat } from "@/lib/time/display";
import type { GoalLabel } from "./TimeGrid";
import { WEEKDAY_LABELS } from "./MiniMonth";
import { anchorOf, type Anchor } from "./FloatingPanel";
import { SharedMonthRow, type OpenShared, type SharedMonthEntry } from "./Shared";

type Props = {
  days: WeekDay[];
  lead: WeekEvent[];
  /** "YYYY-MM" of the shown month (the other days are greyed). */
  month: string;
  goals: GoalLabel[];
  dayHref: (date: string) => string;
  onOpenDay: (date: string) => void;
  onOpenEvent: (event: CalendarEvent, anchor: Anchor) => void;
  /** Spec 29: other people's shared events by day (read only), shown under the day's own events. */
  shared?: Readonly<Record<string, SharedMonthEntry[]>>;
  timeZone?: string;
  onOpenShared?: (shared: OpenShared, anchor: Anchor) => void;
};

/** Spec 29: at most this many shared entries in a month cell, then "+N shared". */
const SHARED_MAX = 2;

/** Height before the first measurement: show text rows already. */
const DEFAULT_HEIGHT = 600;
/** Height of one item row with its gap (18 px row + 2 px gap). */
const ROW_PX = 20;
/** Room above the items: date, padding, border. Generous, so nothing is cut off. */
const HEAD_PX = 33;
/** At most this many dots in a cell on phones. */
const DOTS_MAX = 3;

export function MonthView({ days, lead, month, goals, dayHref, onOpenDay, onOpenEvent, shared, timeZone = "UTC", onOpenShared }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  // Measure the grid's height. Set only in the ResizeObserver's callback.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight((prev) => (prev === entry.contentRect.height ? prev : entry.contentRect.height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cells = useMemo(() => buildMonthCells(days, month, lead), [days, month, lead]);
  const rows = useMemo(() => monthRows(cells), [cells]);
  const max = itemsPerCell(height / 6, ROW_PX, HEAD_PX);
  const dotOf = (goalId: string | null) => {
    const goal = goalId ? goals.find((g) => g.id === goalId) : undefined;
    return goal ? goalColor(goal.look.color).dot : "bg-ink-3";
  };

  return (
    <div className="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-line-subtle bg-surface">
      <div aria-hidden className="grid shrink-0 grid-cols-7 border-b border-line-subtle">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-2 text-center text-[11px] font-medium text-ink-3">
            {label}
          </div>
        ))}
      </div>

      <div ref={gridRef} className="grid min-h-0 min-w-0 flex-1 grid-rows-6">
        {rows.map((row) => (
          <div key={row[0]?.key} className="grid min-h-0 min-w-0 grid-cols-7">
            {row.map((cell, col) => (
              <DayCell
                key={cell.key}
                cell={cell}
                first={col === 0}
                max={max}
                dotOf={dotOf}
                dayHref={dayHref}
                onOpenDay={onOpenDay}
                onOpenEvent={onOpenEvent}
                shared={shared?.[cell.key]}
                timeZone={timeZone}
                onOpenShared={onOpenShared}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

type CellProps = {
  cell: MonthCell;
  first: boolean;
  max: number;
  dotOf: (goalId: string | null) => string;
  dayHref: (date: string) => string;
  onOpenDay: (date: string) => void;
  onOpenEvent: (event: CalendarEvent, anchor: Anchor) => void;
  shared?: SharedMonthEntry[];
  timeZone: string;
  onOpenShared?: (shared: OpenShared, anchor: Anchor) => void;
};

function DayCell({ cell, first, max, dotOf, dayHref, onOpenDay, onOpenEvent, shared, timeZone, onOpenShared }: CellProps) {
  const numberClass = cell.isToday ? "bg-today text-white" : cell.inMonth ? "text-ink" : "text-ink-3";

  return (
    // A click on the cell's background opens the day; the date is the same as a link (keyboard, screen readers).
    <div
      onClick={() => onOpenDay(cell.key)}
      className={`flex min-h-0 min-w-0 cursor-pointer flex-col overflow-hidden border-t border-line-subtle p-1 ${first ? "" : "border-l"} ${
        cell.inMonth ? "" : "bg-raised/40"
      }`}
    >
      <Link
        href={dayHref(cell.key)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Open ${fmtDateLong(cell.key)}${cell.isToday ? ", today" : ""}`}
        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${numberClass}`}
      >
        {Number(cell.key.slice(8, 10))}
      </Link>

      {/* Phones (narrow grid): dots only. Wider: rows. */}
      <CompactMarks items={cell.items} dotOf={dotOf} />
      <CellItems cell={cell} max={max} dotOf={dotOf} onOpenDay={onOpenDay} onOpenEvent={onOpenEvent} />
      {shared && shared.length > 0 && onOpenShared && (
        <ul aria-label="Shared calendars" className="mt-0.5 flex min-h-0 flex-col gap-0.5 overflow-hidden @max-[532px]:hidden">
          {shared.slice(0, SHARED_MAX).map((entry) => (
            <li key={entry.key} className="shrink-0">
              <SharedMonthRow entry={entry} timeZone={timeZone} onOpen={onOpenShared} />
            </li>
          ))}
          {shared.length > SHARED_MAX && (
            <li className="shrink-0 truncate px-1 text-[11px] leading-[18px] text-ink-3">+{shared.length - SHARED_MAX} shared</li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Wider screens: as many item rows as fit the cell, then "+N more". */
function CellItems({
  cell,
  max,
  dotOf,
  onOpenDay,
  onOpenEvent,
}: {
  cell: MonthCell;
  max: number;
  dotOf: (goalId: string | null) => string;
  onOpenDay: (date: string) => void;
  onOpenEvent: (event: CalendarEvent, anchor: Anchor) => void;
}) {
  const { shown, more } = splitVisible(cell.items, max);
  if (shown.length === 0 && more === 0) return null;

  return (
    <ul className="mt-0.5 flex min-h-0 flex-col gap-0.5 overflow-hidden @max-[532px]:hidden">
      {shown.map((item) => (
        <li key={item.key} className="shrink-0">
          <ItemButton item={item} dot={dotOf(item.event.goalId)} onOpenEvent={onOpenEvent} />
        </li>
      ))}
      {more > 0 && (
        <li className="shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDay(cell.key);
            }}
            aria-label={`${more} more on ${fmtDateShort(cell.key)}`}
            className="h-[18px] w-full shrink-0 truncate rounded px-1 text-left text-[11px] leading-[18px] text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            +{more} more
          </button>
        </li>
      )}
    </ul>
  );
}

/** The item's name for screen readers: title and time ("until 2am" for the part after midnight). */
function itemLabel(item: MonthItem, format: TimeFormat): string {
  if (item.kind === "allDay") return `${item.event.title}, all day`;
  if (item.continuesBefore) return `${item.event.title}, until ${fmtTime(item.event.endTime, format)}`;
  return `${item.event.title}, ${fmtRange(item.event.startTime, item.event.endTime, format)}${item.event.status === "done" ? ", done" : ""}`;
}

function ItemButton({ item, dot, onOpenEvent }: { item: MonthItem; dot: string; onOpenEvent: (event: CalendarEvent, anchor: Anchor) => void }) {
  const { timeFormat } = useDisplay();
  const done = item.event.status === "done";
  const showTime = item.kind === "timed" && !item.continuesBefore;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenEvent(item.event, anchorOf(e.currentTarget));
      }}
      aria-label={itemLabel(item, timeFormat)}
      // The part after midnight repeats an event of the day before: mouse only, not a second tab stop.
      tabIndex={item.kind === "timed" && item.continuesBefore ? -1 : undefined}
      className={`flex h-[18px] w-full shrink-0 items-center gap-1 rounded px-1 text-left text-[11px] leading-[18px] hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
        done ? "text-ink-3" : "text-ink"
      }`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      {showTime && <span className="shrink-0 tabular text-ink-3">{fmtTime(item.event.startTime, timeFormat)}</span>}
      <span className="min-w-0 flex-1 truncate">{item.event.title}</span>
    </button>
  );
}

/** Phones: up to three dots and "+N". No buttons of their own: a tap on the cell opens the day. */
function CompactMarks({ items, dotOf }: { items: MonthItem[]; dotOf: (goalId: string | null) => string }) {
  if (items.length === 0) return null;
  const dots = items.slice(0, DOTS_MAX);
  const more = items.length - dots.length;

  return (
    <div aria-hidden className="mt-0.5 flex items-center gap-0.5 overflow-hidden @min-[532px]:hidden">
      {dots.map((item) => (
        <span key={item.key} className={`size-1.5 shrink-0 rounded-full ${dotOf(item.event.goalId)}`} />
      ))}
      {more > 0 && <span className="text-[10px] leading-none tabular text-ink-2">+{more}</span>}
    </div>
  );
}
