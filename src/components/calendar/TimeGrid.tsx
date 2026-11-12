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
import { blockBox, formatMinute, hourMarks, isBeforeGrid, minuteToPx, rangeHeight, slotAt, type GridRange, type Placed } from "@/lib/events/grid";
import type { AllDayEvent, CalendarEvent, WeekDay } from "@/lib/events/types";
import { Check, ImportedIcon, NotSentIcon, Warning } from "@/components/ui/icons";
import { goalColor } from "@/lib/goals/colors";
import { dayParts } from "@/lib/time/zoned";

/** What the grid needs of a goal: its name and its place in the list (for the colour). */
export type GoalLabel = { id: string; title: string; colorIndex: number };

type Props = {
  goals: GoalLabel[];
  days: WeekDay[];
  placed: Placed[][];
  range: GridRange;
  /** Minutes after midnight now, if today is in this week. */
  nowMin: number | null;
  /** On phones only this day's column is shown (the day strip above chooses it). */
  selectedDay: string;
  onOpenEvent: (event: CalendarEvent) => void;
  onCreateAt: (date: string, slot: { startMin: number; endMin: number }) => void;
};

/** R11 and R26 in words: where the event came from, or that Outlook does not have it yet. */
function outlookWords(event: CalendarEvent): string[] {
  if (event.source === "outlook") return ["from Outlook"];
  return event.notSent ? ["not sent to Outlook"] : [];
}

/** The small marks for Outlook, next to the conflict and done marks. */
function OutlookMark({ event }: { event: CalendarEvent }) {
  if (event.source === "outlook") return <ImportedIcon className="size-3 text-ink-3" />;
  if (event.notSent) return <NotSentIcon className="size-3 text-danger" />;
  return null;
}

/** The block's accessible name: everything the block shows, in words. */
function blockLabel(block: Placed, dayLong: string, goal: GoalLabel | undefined): string {
  const { event } = block;
  const end = event.endDay ? `${event.endTime} the next day` : event.endTime;
  const parts = [`${event.title}, ${dayLong}, ${event.startTime} to ${end}`];
  if (goal) parts.push(`goal ${goal.title}`);
  if (event.conflict) parts.push("overlaps another event");
  if (event.status === "done") parts.push("done");
  parts.push(...outlookWords(event));
  return parts.join(", ");
}

type BlockProps = { block: Placed; range: GridRange; dayLong: string; goal: GoalLabel | undefined; onOpen: () => void };

function EventBlock({ block, range, dayLong, goal, onOpen }: BlockProps) {
  const { event } = block;
  // Events of a goal take the goal's colour; others stay neutral. A conflict adds a red edge and an icon.
  const colors = goal ? goalColor(goal.colorIndex).block : "bg-raised border-line-subtle text-ink";
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
      aria-label={blockLabel(block, dayLong, goal)}
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
        colors
      } ${event.conflict ? "border-l-[3px] border-l-danger" : ""} ${done ? "opacity-70" : ""}`}
    >
      <span
        // Whole words only: two lines when there is room, otherwise one line cut with an ellipsis.
        // The button's accessible name carries the full title.
        className={`block pr-4 text-[11px] font-medium leading-[14px] ${height >= 40 && block.lanes === 1 ? "line-clamp-2" : "truncate"} ${
          done ? "line-through" : ""
        }`}
      >
        {event.title}
      </span>
      {height >= 44 && <span className="block truncate text-[10px] leading-[13px] tabular opacity-80">{time}</span>}
      {(event.conflict || done || event.source === "outlook" || event.notSent) && (
        <span className="absolute right-1 top-1 flex items-center gap-0.5">
          <OutlookMark event={event} />
          {event.conflict && <Warning className="size-3 text-danger" />}
          {done && <Check className="size-3 text-success" strokeWidth={3} />}
        </span>
      )}
    </button>
  );
}

/** "Exam week, all day, Monday 16 November to Friday 20 November". */
function allDayLabel(event: AllDayEvent): string {
  const first = dayParts(event.firstDay).long;
  const days = event.lastDay === event.firstDay ? first : `${first} to ${dayParts(event.lastDay).long}`;
  return [`${event.title}, all day, ${days}`, ...outlookWords(event)].join(", ");
}

const allDayClass =
  "block w-full truncate rounded-md border border-line bg-raised px-1.5 py-0.5 text-left text-[11px] font-medium leading-[15px] text-ink hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40";

type AllDayRowProps = { days: WeekDay[]; selectedDay: string; onOpenEvent: (event: CalendarEvent) => void };

/**
 * All-day events (R29) in a row above the hours: on wider screens one bar per event across its days
 * of this week, on phones the chosen day's events. Each event is one button with its days in words.
 */
function AllDayRow({ days, selectedDay, onOpenEvent }: AllDayRowProps) {
  const events = [...new Map(days.flatMap((d) => d.allDay).map((e) => [e.id, e])).values()];
  if (events.length === 0) return null;
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
            <button type="button" aria-label={allDayLabel(event)} onClick={() => onOpenEvent(event)} className={allDayClass}>
              <span className="flex items-center gap-1">
                <span className="min-w-0 truncate">{event.title}</span>
                <OutlookMark event={event} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {/* Wider screens: bars across the days, packed into as few rows as fit. */}
      <ul className="hidden min-w-0 flex-1 grid-cols-7 gap-y-0.5 border-l border-line-subtle py-1 [grid-auto-flow:row_dense] md:grid">
        {events.map((event) => {
          const first = event.firstDay < days[0].date ? 0 : columnOf(event.firstDay);
          const last = event.lastDay > days[6].date ? 6 : columnOf(event.lastDay);
          return (
            <li key={event.id} style={{ gridColumn: `${first + 1} / ${last + 2}` }} className="min-w-0 px-0.5">
              <button type="button" aria-label={allDayLabel(event)} onClick={() => onOpenEvent(event)} className={allDayClass}>
                <span className="flex items-center gap-1">
                  <span className="min-w-0 truncate">{event.firstDay < days[0].date ? `… ${event.title}` : event.title}</span>
                  <OutlookMark event={event} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TimeGrid({ goals, days, placed, range, nowMin, selectedDay, onOpenEvent, onCreateAt }: Props) {
  const goalOf = (id: string | null) => (id ? goals.find((g) => g.id === id) : undefined);
  const height = rangeHeight(range);
  const hours = hourMarks(range);
  // After-midnight parts that end before the first visible hour: shown as strips above the grid.
  const early = placed.map((blocks) => blocks.filter((b) => isBeforeGrid(b, range)));
  const hasEarly = early.some((blocks) => blocks.length > 0);
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

        <AllDayRow days={days} selectedDay={selectedDay} onOpenEvent={onOpenEvent} />

        {hasEarly && (
          // Mouse only and not read out: each of these events is already listed on the day it starts.
          // On phones the row shows only when the chosen day has such a strip. Dashed, with "until",
          // so it does not read like the solid all-day bars above it.
          <div
            aria-hidden
            className={`${early[days.findIndex((d) => d.date === selectedDay)]?.length ? "flex" : "hidden"} border-b border-line-subtle md:flex`}
          >
            <div className="w-[52px] shrink-0 pt-1.5 pr-2 text-right text-[10px] leading-[12px] text-ink-3">{`Before ${formatMinute(range.startMin)}`}</div>
            {days.map((day, i) => (
              <div key={day.date} className={`${day.date === selectedDay ? "flex" : "hidden"} min-w-0 flex-1 flex-col gap-0.5 border-l border-line-subtle p-1 md:flex`}>
                {early[i].map((block) => (
                  <button
                    key={block.event.id}
                    type="button"
                    tabIndex={-1}
                    onClick={() => onOpenEvent(block.event)}
                    className="line-clamp-2 rounded-md border border-dashed border-ink-3 bg-raised px-1.5 py-0.5 text-left text-[10px] leading-[13px] text-ink-2"
                  >
                    {`${block.event.title}, until ${block.event.endTime}`}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div data-hour-grid className="relative flex">
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
                  {blocks.filter((block) => !isBeforeGrid(block, range)).map((block) => (
                    <li key={`${block.event.id}-${block.continuesBefore ? "after" : "start"}`}>
                      <EventBlock
                        block={block}
                        range={range}
                        dayLong={parts.long}
                        goal={goalOf(block.event.goalId)}
                        onOpen={() => onOpenEvent(block.event)}
                      />
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
