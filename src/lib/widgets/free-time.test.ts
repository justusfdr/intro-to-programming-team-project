import { describe, expect, it } from "vitest";
import { nextFreeTime, roundUpToFive } from "./free-time";

// Berlin in November is UTC+1, so 09:00 UTC is 10:00 local; the visible day is 7:00 to 21:00 local.
const base = { timeZone: "Europe/Berlin", dayStartHour: 7, dayEndHour: 21 };
const at = (hhmm: string) => new Date(`2026-11-16T${hhmm}:00Z`); // UTC
const ev = (a: string, b: string) => ({ start: at(a), end: at(b) });
const iso = (r: { start: Date; end: Date } | null) => r && { start: r.start.toISOString(), end: r.end.toISOString() };

describe("roundUpToFive", () => {
  it("rounds up to the next full 5 minutes and keeps a time that is already on one", () => {
    expect(roundUpToFive(new Date("2026-11-16T09:01:00Z")).toISOString()).toBe("2026-11-16T09:05:00.000Z");
    expect(roundUpToFive(new Date("2026-11-16T09:05:00Z")).toISOString()).toBe("2026-11-16T09:05:00.000Z");
    expect(roundUpToFive(new Date("2026-11-16T09:04:59Z")).toISOString()).toBe("2026-11-16T09:05:00.000Z");
  });
});

describe("nextFreeTime", () => {
  it("with no events: from now (rounded up) to the end of the visible day", () => {
    expect(iso(nextFreeTime({ ...base, now: at("09:02"), events: [] }))).toEqual({ start: "2026-11-16T09:05:00.000Z", end: "2026-11-16T20:00:00.000Z" });
  });

  it("before the visible day starts: from the start of the visible day", () => {
    expect(iso(nextFreeTime({ ...base, now: at("03:00"), events: [] }))?.start).toBe("2026-11-16T06:00:00.000Z");
  });

  it("starts after the event that is on now", () => {
    const r = nextFreeTime({ ...base, now: at("09:10"), events: [ev("09:00", "10:00")] });
    expect(iso(r)).toEqual({ start: "2026-11-16T10:00:00.000Z", end: "2026-11-16T20:00:00.000Z" });
  });

  it("takes a gap of exactly 30 minutes between two events", () => {
    const r = nextFreeTime({ ...base, now: at("09:00"), events: [ev("09:00", "10:00"), ev("10:30", "12:00")] });
    expect(iso(r)).toEqual({ start: "2026-11-16T10:00:00.000Z", end: "2026-11-16T10:30:00.000Z" });
  });

  it("skips a gap shorter than 30 minutes and overlapping events", () => {
    const r = nextFreeTime({ ...base, now: at("09:00"), events: [ev("09:20", "10:00"), ev("09:45", "11:00"), ev("11:20", "12:00")] });
    expect(iso(r)).toEqual({ start: "2026-11-16T12:00:00.000Z", end: "2026-11-16T20:00:00.000Z" });
  });

  it("ignores events that are over, and finds the gap before the first event still to come", () => {
    const r = nextFreeTime({ ...base, now: at("12:00"), events: [ev("08:00", "09:00"), ev("13:00", "14:00")] });
    expect(iso(r)).toEqual({ start: "2026-11-16T12:00:00.000Z", end: "2026-11-16T13:00:00.000Z" });
  });

  it("is null when the rest of the visible day is shorter than 30 minutes", () => {
    expect(nextFreeTime({ ...base, now: at("19:40"), events: [] })).toBeNull();
  });

  it("is null when an event runs to the end of the visible day or past it", () => {
    expect(nextFreeTime({ ...base, now: at("15:00"), events: [ev("15:00", "20:30")] })).toBeNull();
  });

  it("is null after the visible day has ended", () => {
    expect(nextFreeTime({ ...base, now: at("21:30"), events: [] })).toBeNull();
  });

  it("does not take a gap that is cut short by the end of the day", () => {
    // Free from 19:45 UTC, but the day ends at 20:00 UTC (21:00 Berlin): only 15 minutes.
    expect(nextFreeTime({ ...base, now: at("18:00"), events: [ev("18:00", "19:45"), ev("20:30", "21:00")] })).toBeNull();
  });

  it("an end hour of 24 means midnight in the user's time zone", () => {
    const r = nextFreeTime({ ...base, dayEndHour: 24, now: at("20:00"), events: [] });
    expect(iso(r)?.end).toBe("2026-11-16T23:00:00.000Z");
  });

  it("uses the user's time zone for 'today'", () => {
    // 23:30 UTC on the 16th is already the 17th, 00:30 in Berlin; the visible day then starts at 06:00 UTC on the 17th.
    const r = nextFreeTime({ ...base, now: at("23:30"), events: [] });
    expect(iso(r)?.start).toBe("2026-11-17T06:00:00.000Z");
  });
});
