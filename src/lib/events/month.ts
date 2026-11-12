// The month grid's cells and rows, copied from the first prototype's components/calendar/month.ts and
// changed to the app's days: every event is listed on each day it touches (an all-day event on each of
// its days; an event past midnight on its day and, without its start time, on the next). Pure, no React.
import type { AllDayEvent, WeekDay, WeekEvent } from "./types";

/** One line in a day cell. */
export type MonthItem =
  | { key: string; kind: "allDay"; event: AllDayEvent }
  | { key: string; kind: "timed"; event: WeekEvent; continuesBefore: boolean };

export type MonthCell = {
  key: string;
  inMonth: boolean;
  isToday: boolean;
  items: MonthItem[];
};

/**
 * The cells of the shown days (the 42 of the grid). `month` is "YYYY-MM" of the shown month; `lead`
 * the events of the day before the first cell that run into it. Per day: all-day events first, then
 * the part after midnight of an event from the day before, then the day's events by start.
 */
export function buildMonthCells(days: readonly WeekDay[], month: string, lead: readonly WeekEvent[] = []): MonthCell[] {
  return days.map((day, i) => {
    const before = i === 0 ? lead : days[i - 1].events;
    const carried = before.filter((e) => e.endDay === day.date && e.endLocal > `${day.date}T00:00`);
    return {
      key: day.date,
      inMonth: day.date.slice(0, 7) === month,
      isToday: day.isToday,
      items: [
        ...day.allDay.map((event): MonthItem => ({ key: `a:${event.id}`, kind: "allDay", event })),
        ...carried.map((event): MonthItem => ({ key: `c:${event.id}`, kind: "timed", event, continuesBefore: true })),
        ...day.events.map((event): MonthItem => ({ key: `t:${event.id}`, kind: "timed", event, continuesBefore: false })),
      ],
    };
  });
}

/** Splits the 42 cells into 6 rows of 7. */
export function monthRows<T>(cells: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/**
 * How many items fit in a cell. If they don't all fit, the last slot becomes "+N more",
 * so we show max - 1 items.
 */
export function splitVisible<T>(items: T[], max: number): { shown: T[]; more: number } {
  if (max <= 0) return { shown: [], more: items.length };
  if (items.length <= max) return { shown: items.slice(), more: 0 };
  const shown = items.slice(0, Math.max(0, max - 1));
  return { shown, more: items.length - shown.length };
}

/** How many item rows fit below the day number in a cell of the given height. */
export function itemsPerCell(cellHeightPx: number, rowPx = 20, headerPx = 28): number {
  return Math.max(0, Math.floor((cellHeightPx - headerPx) / rowPx));
}
