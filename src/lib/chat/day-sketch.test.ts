// Tests for the draft drawn as its day (spec 19, step B): days, the window of hours, block positions,
// proposals past midnight, and the calendar's events around them.
import { describe, expect, it } from "vitest";
import type { EventDto } from "@/lib/events/types";
import { draftDaysOf, SKETCH_HOUR_PX, SKETCH_MIN_BLOCK_PX, sketchBox, sketchDraft, sketchHeight } from "./day-sketch";

const TZ = "Europe/Lisbon"; // UTC+0 in November
const proposal = (title: string, start: string, end: string, goalId: string | null = null) => ({
  title,
  startAt: `2026-11-${start}:00.000Z`,
  endAt: `2026-11-${end}:00.000Z`,
  goalId,
});

const event = (fields: Partial<EventDto>): EventDto => ({
  id: "e",
  title: "Event",
  allDay: false,
  startAt: null,
  endAt: null,
  firstDay: null,
  lastDay: null,
  mayOverlap: false,
  status: "planned",
  goalId: null,
  seriesId: null,
  source: "app",
  location: null,
  notSent: false,
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...fields,
});

// A5: Tuesday 17 November: study 08:00–13:00, call 13:30–14:00, sport 18:00–19:30, event 20:00–22:30.
const A5 = [
  proposal("Study", "17T08:00", "17T13:00", "goal-exam"),
  proposal("Call", "17T13:30", "17T14:00"),
  proposal("Sport", "17T18:00", "17T19:30", "goal-run"),
  proposal("Event", "17T20:00", "17T22:30"),
];

describe("sketchDraft", () => {
  it("A5: one day, from the hour before the first proposal (7:00) to the hour after the last (24:00)", () => {
    const [day, ...rest] = sketchDraft(A5, [], TZ);
    expect(rest).toEqual([]);
    expect(day.date).toBe("2026-11-17");
    expect([day.startMin, day.endMin]).toEqual([7 * 60, 24 * 60]);
    expect(day.hours).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].map((h) => h * 60));
    expect(day.proposals.map((p) => [p.title, p.startTime, p.endTime, p.goalId])).toEqual([
      ["Study", "08:00", "13:00", "goal-exam"],
      ["Call", "13:30", "14:00", null],
      ["Sport", "18:00", "19:30", "goal-run"],
      ["Event", "20:00", "22:30", null],
    ]);
  });

  it("rounds the window to whole hours around proposals that start or end on the half hour", () => {
    const [day] = sketchDraft([proposal("Read", "18T09:30", "18T10:15")], [], TZ);
    expect([day.startMin, day.endMin]).toEqual([8 * 60, 12 * 60]);
  });

  it("puts a proposal past midnight on its start day, its block running to midnight", () => {
    const days = sketchDraft([proposal("Night out", "18T22:00", "19T01:00"), proposal("Run", "19T08:00", "19T09:00")], [], TZ);
    expect(days.map((d) => d.date)).toEqual(["2026-11-18", "2026-11-19"]);
    const [night] = days[0].proposals;
    expect([night.startMin, night.endMin, night.endTime, night.endsNextDay]).toEqual([22 * 60, 24 * 60, "01:00", true]);
    expect([days[0].startMin, days[0].endMin]).toEqual([21 * 60, 24 * 60]);
    expect(days[1].proposals.map((p) => p.title)).toEqual(["Run"]);
  });

  it("uses the wall clock of the user's time zone", () => {
    // 08:00 UTC is 09:00 in Berlin; 23:30 UTC on the 17th is already the 18th there.
    const days = sketchDraft([proposal("Study", "17T08:00", "17T09:00"), proposal("Late", "17T23:30", "18T00:30")], [], "Europe/Berlin");
    expect(days.map((d) => [d.date, d.proposals[0].startTime])).toEqual([
      ["2026-11-17", "09:00"],
      ["2026-11-18", "00:30"],
    ]);
    expect(draftDaysOf([proposal("Late", "17T23:30", "18T00:30")], "Europe/Berlin")).toEqual(["2026-11-18"]);
  });

  it("draws the calendar's timed events of that day inside the window, and lists its all-day events", () => {
    const calendar = [
      event({ id: "a", title: "Lecture", startAt: "2026-11-17T09:00:00Z", endAt: "2026-11-17T10:30:00Z", goalId: "goal-exam" }),
      event({ id: "b", title: "Early swim", startAt: "2026-11-17T05:00:00Z", endAt: "2026-11-17T06:00:00Z" }),
      event({ id: "c", title: "Night shift", startAt: "2026-11-16T22:00:00Z", endAt: "2026-11-17T07:30:00Z" }),
      event({ id: "d", title: "Other day", startAt: "2026-11-18T09:00:00Z", endAt: "2026-11-18T10:00:00Z" }),
      event({ id: "e", title: "Exam week", allDay: true, firstDay: "2026-11-16", lastDay: "2026-11-20" }),
      event({ id: "f", title: "Holiday", allDay: true, firstDay: "2026-11-18", lastDay: "2026-11-18" }),
    ];
    const [day] = sketchDraft(A5, calendar, TZ);
    expect(day.existing.map((b) => [b.title, b.startMin, b.endMin, b.startsBefore])).toEqual([
      ["Night shift", 0, 7 * 60 + 30, true],
      ["Lecture", 9 * 60, 10 * 60 + 30, false],
    ]);
    expect(day.allDay).toEqual(["Exam week"]);
  });

  it("leaves out the calendar's events of earlier days (Lernen on the 16th is not drawn on the 17th)", () => {
    const calendar = [
      event({ id: "a", title: "Lernen", startAt: "2026-11-16T08:00:00Z", endAt: "2026-11-16T10:00:00Z" }),
      event({ id: "b", title: "Mittagessen", startAt: "2026-11-15T12:00:00Z", endAt: "2026-11-15T13:00:00Z" }),
    ];
    const [day] = sketchDraft(A5, calendar, TZ);
    expect(day.existing).toEqual([]);
  });
});

describe("sketchBox", () => {
  const day = { startMin: 7 * 60, endMin: 24 * 60 };

  it("places a block by its start and length", () => {
    expect(sketchBox({ startMin: 8 * 60, endMin: 13 * 60 }, day)).toEqual({ top: SKETCH_HOUR_PX, height: 5 * SKETCH_HOUR_PX });
    expect(sketchBox({ startMin: 13 * 60 + 30, endMin: 14 * 60 }, day)).toEqual({ top: 6.5 * SKETCH_HOUR_PX, height: SKETCH_HOUR_PX / 2 });
  });

  it("keeps a short block readable and cuts a block at the window's edge", () => {
    expect(sketchBox({ startMin: 9 * 60, endMin: 9 * 60 + 15 }, day).height).toBe(SKETCH_MIN_BLOCK_PX);
    expect(sketchBox({ startMin: 0, endMin: 7 * 60 + 30 }, day)).toEqual({ top: 0, height: SKETCH_HOUR_PX / 2 });
  });

  it("gives the column's height", () => {
    expect(sketchHeight(day)).toBe(17 * SKETCH_HOUR_PX);
  });
});
