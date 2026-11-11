"use client";

// The week as a time grid, in the prototype's layout: an hour axis, seven day columns with weekday
// and date (today in red), events as blocks placed by start and length, and the current-time line.
// Layout maths: src/lib/events/grid.ts.
//
// For screen readers and the keyboard, each day is a labelled list of its events in time order,
// and each event is a button whose name says title, day, time and marks. The hour axis, the lines
// and the empty slots are decoration. A click on an empty slot (mouse or touch) creates an event
// there; keyboard users use "New event".
import type { MouseEvent } from "react";
import { blockBox, formatMinute, hourMarks, minuteToPx, rangeHeight, slotAt, type GridRange, type Placed } from "@/lib/events/grid";
import type { WeekDay, WeekEvent } from "@/lib/events/types";
import { Check, Warning } from "@/components/ui/icons";
import { dayParts } from "@/lib/time/zoned";

type Props = {
  days: WeekDay[];
  placed: Placed[][];
  range: GridRange;
  /** Minutes after midnight now, if today is in this week. */
  nowMin: number | null;
  /** On phones only this day's column is shown (the day strip above chooses it). */
  selectedDay: string;
  onOpenEvent: (event: WeekEvent) => void;
  onCreateAt: (date: string, slot: { startMin: number; endMin: number }) => void;
};

/** The block's accessible name: everything the block shows, in words. */
function blockLabel(block: Placed, dayLong: string): string {
  const { event } = block;
  const end = event.endDay ? `${event.endTime} the next day` : event.endTime;
  const parts = [`${event.title}, ${dayLong}, ${event.startTime} to ${end}`];
  if (event.conflict) parts.push("overlaps another event");
  if (event.status === "done") parts.push("done");
  return parts.join(", ");
}

function EventBlock({ block, range, dayLong, onOpen }: { block: Placed; range: GridRange; dayLong: string; onOpen: () => void }) {
  const { event } = block;
  const { top, height } = blockBox(block, range);
  const done = event.status === "done";
  const time = `${block.continuesBefore ? "…" : event.startTime} – ${block.continuesAfter ? `${event.endTime}+1` : event.endTime}`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={blockLabel(block, dayLong)}
      // The part after midnight repeats an event already in the list: mouse only, not a second tab stop.
      tabIndex={block.continuesBefore ? -1 : undefined}
      aria-hidden={block.continuesBefore || undefined}
      style={{
        top: top + 1,
        height: height - 2,
        left: `calc(${(block.lane / block.lanes) * 100}% + 2px)`,
        width: `calc(${100 / block.lanes}% - 4px)`,
      }}
      className={`pointer-events-auto absolute z-[2] overflow-hidden rounded-lg border px-1.5 py-1 text-left transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${
        event.conflict ? "border-danger border-l-[3px] bg-danger-soft" : "border-line-subtle bg-raised"
      } ${done ? "text-ink-2" : "text-ink"}`}
    >
      <span
        className={`block break-words hyphens-auto pr-4 text-[11px] font-medium leading-[14px] ${height >= 40 ? "line-clamp-2" : "truncate"} ${
          done ? "line-through" : ""
        }`}
      >
        {event.title}
      </span>
      {height >= 44 && <span className="block truncate text-[10px] leading-[13px] tabular text-ink-2">{time}</span>}
      {(event.conflict || done) && (
        <span className="absolute right-1 top-1 flex items-center gap-0.5">
          {event.conflict && <Warning className="size-3 text-danger" />}
          {done && <Check className="size-3 text-success" strokeWidth={3} />}
        </span>
      )}
    </button>
  );
}

export function TimeGrid({ days, placed, range, nowMin, selectedDay, onOpenEvent, onCreateAt }: Props) {
  const height = rangeHeight(range);
  const hours = hourMarks(range);
  const showNow = nowMin !== null && nowMin >= range.startMin && nowMin < range.endMin;

  function createAt(e: MouseEvent<HTMLDivElement>, date: string) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onCreateAt(date, slotAt(e.clientY - rect.top, range));
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-card border border-line-subtle bg-surface select-none">
      <div data-grid-scroll className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
        {/* Weekday and date over each column (wider screens; phones use the day strip). */}
        <div aria-hidden className="sticky top-0 z-20 hidden border-b border-line-subtle bg-surface md:flex">
          <div className="w-[52px] shrink-0" />
          {days.map((day) => {
            const parts = dayParts(day.date);
            return (
              <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2">
                <span className="text-[11px] font-medium text-ink-3">{parts.weekday}</span>
                <span
                  className={`flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular ${
                    day.isToday ? "bg-today text-white" : "text-ink"
                  }`}
                >
                  {parts.day}
                </span>
              </div>
            );
          })}
        </div>

        <div className="relative flex">
          {/* Hour axis. */}
          <div aria-hidden className="relative w-[52px] shrink-0" style={{ height }}>
            {hours
              // The red time label replaces an hour label right next to it.
              .filter((m) => !showNow || Math.abs(m - (nowMin ?? 0)) > 12)
              .map((m) => (
                <span key={m} className="absolute right-2 text-[11px] tabular text-ink-3" style={{ top: minuteToPx(m, range) + 2 }}>
                  {formatMinute(m)}
                </span>
              ))}
            {showNow && (
              <span
                className="absolute right-1 -translate-y-1/2 rounded bg-today px-1 text-[10px] font-medium tabular text-white"
                style={{ top: minuteToPx(nowMin ?? 0, range) }}
              >
                {formatMinute(nowMin ?? 0)}
              </span>
            )}
          </div>

          {days.map((day, i) => {
            const parts = dayParts(day.date);
            const blocks = placed[i];
            const listed = blocks.filter((b) => !b.continuesBefore);
            return (
              <section
                key={day.date}
                aria-label={`${parts.long}${day.isToday ? ", today" : ""}`}
                className={`${day.date === selectedDay ? "block" : "hidden"} relative min-w-0 flex-1 border-l border-line-subtle md:block ${
                  day.isToday ? "bg-raised/40" : ""
                }`}
                style={{ height }}
              >
                {/* The empty area: lines, and a click creates an event at that time. */}
                <div aria-hidden className="absolute inset-0 cursor-cell" onClick={(e) => createAt(e, day.date)}>
                  {hours.map((m) => (
                    <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-line-subtle" style={{ top: minuteToPx(m, range) }} />
                  ))}
                </div>
                {/* Under the blocks: over a title the line would look like strike-through. */}
                {day.isToday && showNow && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[1] h-px bg-today" style={{ top: minuteToPx(nowMin ?? 0, range) }}>
                    <span className="absolute -left-[3px] -top-[3px] size-[7px] rounded-full bg-today" />
                  </div>
                )}
                {listed.length === 0 && <p className="sr-only">No events</p>}
                <ul className="pointer-events-none absolute inset-0">
                  {blocks.map((block) => (
                    <li key={`${block.event.id}-${block.continuesBefore ? "after" : "start"}`}>
                      <EventBlock block={block} range={range} dayLong={parts.long} onOpen={() => onOpenEvent(block.event)} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
