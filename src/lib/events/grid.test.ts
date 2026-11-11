import { describe, expect, it } from "vitest";
import { blockBox, formatMinute, gridRange, HOUR_PX, isBeforeGrid, MIN_BLOCK_PX, minuteOfLocal, placeWeek, slotAt } from "./grid";
import type { WeekDay, WeekEvent } from "./types";

const DATES = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];

function event(id: string, start: string, end: string, endDay: string | null = null): WeekEvent {
  return {
    id,
    title: id,
    startAt: "",
    endAt: "",
    mayOverlap: false,
    status: "planned",
    updatedAt: "",
    conflict: false,
    startTime: start.slice(11),
    endTime: end.slice(11),
    endDay,
    startLocal: start,
    endLocal: end,
  };
}

function week(byDay: Record<number, WeekEvent[]>): WeekDay[] {
  return DATES.map((date, i) => ({ date, label: date, isToday: false, events: byDay[i] ?? [] }));
}

describe("placing events in the time grid", () => {
  it("reads minutes after midnight from a local time", () => {
    expect(minuteOfLocal("2026-11-16T09:30")).toBe(570);
    expect(formatMinute(570)).toBe("09:30");
  });

  it("gives overlapping events side-by-side lanes and leaves touching ones full width", () => {
    const placed = placeWeek(
      week({
        0: [
          event("a", "2026-11-16T09:00", "2026-11-16T11:00"),
          event("b", "2026-11-16T10:00", "2026-11-16T12:00"),
          event("c", "2026-11-16T12:00", "2026-11-16T13:00"),
        ],
      }),
    )[0];
    expect(placed.map((p) => [p.event.id, p.lane, p.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ]);
  });

  it("splits an event past midnight into a block until 24:00 and one from 00:00 on the next day", () => {
    const placed = placeWeek(week({ 2: [event("late", "2026-11-18T23:00", "2026-11-19T01:30", "2026-11-19")] }));
    expect(placed[2]).toMatchObject([{ startMin: 23 * 60, endMin: 24 * 60, continuesAfter: true, continuesBefore: false }]);
    expect(placed[3]).toMatchObject([{ startMin: 0, endMin: 90, continuesBefore: true, continuesAfter: false }]);
  });

  it("does not add a continuation after Sunday (the next week shows it)", () => {
    const placed = placeWeek(week({ 6: [event("late", "2026-11-22T23:30", "2026-11-23T00:30", "2026-11-23")] }));
    expect(placed.flat()).toHaveLength(1);
  });

  it("shows 07:00 to 22:00, widened to whole hours for early and late events", () => {
    expect(gridRange(placeWeek(week({})))).toEqual({ startMin: 420, endMin: 1320 });
    const placed = placeWeek(
      week({ 0: [event("early", "2026-11-16T06:15", "2026-11-16T06:30")], 1: [event("late", "2026-11-17T22:00", "2026-11-17T22:45")] }),
    );
    expect(gridRange(placed)).toEqual({ startMin: 360, endMin: 1380 });
  });

  it("draws a 15-minute event at the minimum height and a five-hour event at five hours", () => {
    const range = { startMin: 420, endMin: 1320 };
    expect(blockBox({ startMin: 540, endMin: 555 }, range)).toEqual({ top: 2 * HOUR_PX, height: MIN_BLOCK_PX });
    expect(blockBox({ startMin: 540, endMin: 840 }, range).height).toBe(5 * HOUR_PX);
  });

  it("suggests a one-hour event from the half hour above a click, inside the day", () => {
    const range = { startMin: 420, endMin: 1320 };
    expect(slotAt(2.7 * HOUR_PX, range)).toEqual({ startMin: 570, endMin: 630 }); // 09:42 → 09:30
    expect(slotAt(-10, range)).toEqual({ startMin: 420, endMin: 480 });
    expect(slotAt(30 * HOUR_PX, { startMin: 0, endMin: 1440 })).toEqual({ startMin: 1380, endMin: 1440 });
  });

  it("does not widen the hours for the part of an event after midnight; that block starts at the top", () => {
    const placed = placeWeek(week({ 2: [event("late", "2026-11-18T22:00", "2026-11-19T02:00", "2026-11-19")] }));
    const range = gridRange(placed);
    expect(range).toEqual({ startMin: 420, endMin: 1440 });
    expect(blockBox(placed[3][0], range)).toEqual({ top: 0, height: MIN_BLOCK_PX });
  });

  it("puts the after-midnight part above the grid when it ends before the first hour, and in the grid otherwise", () => {
    const placed = placeWeek(
      week({
        2: [event("short", "2026-11-18T22:00", "2026-11-19T02:00", "2026-11-19")],
        4: [event("long", "2026-11-20T23:00", "2026-11-21T08:00", "2026-11-21")],
      }),
    );
    const range = gridRange(placed);
    expect(isBeforeGrid(placed[3][0], range)).toBe(true); // 00:00–02:00, grid starts 07:00
    expect(isBeforeGrid(placed[5][0], range)).toBe(false); // 00:00–08:00 reaches into the grid
    expect(isBeforeGrid(placed[2][0], range)).toBe(false); // the start part is never a strip
  });
});
