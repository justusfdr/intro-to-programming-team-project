// The calendar's travel blocks (R27): where the dashed block before an event stands, and that the grid draws
// it only for events with a time to leave.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TimeGrid } from "@/components/calendar/TimeGrid";
import { placeWeek } from "@/lib/events/grid";
import type { WeekEvent } from "@/lib/events/types";
import { travelBlock } from "./blocks";
import type { TravelAnswer } from "./types";
import { canTravel, isWebLink } from "./web-link";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const OK: TravelAnswer = { status: "ok", mode: "driving", minutes: 25, bufferMinutes: 10, leaveAt: "2026-11-17T09:25:00.000Z" };
const START = { startAt: "2026-11-17T10:00:00.000Z" };

describe("travelBlock", () => {
  it("A9: from 9:25 to the start at 10:00 (trip and buffer together)", () => {
    expect(travelBlock(START, 600, false, OK)).toEqual({ fromMin: 565, toMin: 600, totalMin: 35, tripMin: 25, mode: "driving" });
  });

  it("is cut at midnight when the trip starts the day before", () => {
    expect(travelBlock({ startAt: "2026-11-17T00:30:00.000Z" }, 30, false, { ...OK, leaveAt: "2026-11-16T23:30:00.000Z" })).toEqual({
      fromMin: 0,
      toMin: 30,
      totalMin: 60,
      tripMin: 25,
      mode: "driving",
    });
  });

  it("is null without a time to leave, for the part after midnight, and for a time to leave after the start", () => {
    expect(travelBlock(START, 600, false, undefined)).toBeNull();
    expect(travelBlock(START, 600, false, { status: "unavailable", mode: "driving", message: "Travel time not available" })).toBeNull();
    expect(travelBlock(START, 600, true, OK)).toBeNull();
    expect(travelBlock(START, 600, false, { ...OK, leaveAt: "2026-11-17T10:05:00.000Z" })).toBeNull();
  });
});

describe("canTravel", () => {
  it("is true only for a timed event with a place that is not a web link", () => {
    expect(canTravel({ allDay: false, location: "Nova SBE, Carcavelos" })).toBe(true);
    expect(canTravel({ allDay: true, location: "Porto" })).toBe(false);
    expect(canTravel({ allDay: false, location: null })).toBe(false);
    expect(canTravel({ allDay: false, location: "  " })).toBe(false);
    expect(canTravel({ allDay: false, location: "https://zoom.us/j/1" })).toBe(false);
    expect(isWebLink("Rua Augusta 100, Lisboa")).toBe(false);
  });
});

const LECTURE: WeekEvent = {
  id: "e1",
  title: "Lecture",
  allDay: false,
  startAt: "2026-11-17T10:00:00.000Z",
  endAt: "2026-11-17T11:00:00.000Z",
  firstDay: null,
  lastDay: null,
  mayOverlap: false,
  status: "planned",
  goalId: null,
  seriesId: null,
  source: "app",
  location: "Nova SBE, Carcavelos",
  notSent: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  conflict: false,
  startTime: "10:00",
  endTime: "11:00",
  endDay: null,
  startLocal: "2026-11-17T10:00",
  endLocal: "2026-11-17T11:00",
};

const grid = (travel?: Record<string, TravelAnswer>) => {
  const days = [{ date: "2026-11-17", label: "Tue 17", isToday: false, events: [LECTURE], allDay: [] }];
  return renderToStaticMarkup(
    <TimeGrid
      goals={[]}
      days={days}
      placed={placeWeek(days)}
      range={{ startMin: 7 * 60, endMin: 21 * 60 }}
      nowMin={null}
      selectedDay="2026-11-17"
      onOpenEvent={() => {}}
      onCreate={() => {}}
      travel={travel}
    />,
  );
};

describe("the grid", () => {
  it("draws a dashed block before an event with a time to leave, with the time and the trip", () => {
    const html = grid({ e1: OK });
    expect(html).toMatch(/<div aria-hidden="true" data-travel-for="e1"[^>]*border-dashed/);
    expect(html).toContain("Leave 9:25am");
    expect(html).toContain("25m by car");
  });

  it("draws none without an answer or with a message", () => {
    expect(grid()).not.toContain("data-travel-for");
    expect(grid({ e1: { status: "not_found", mode: "driving", message: "Address not found" } })).not.toContain("data-travel-for");
  });
});
