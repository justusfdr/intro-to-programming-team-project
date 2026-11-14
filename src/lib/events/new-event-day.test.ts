// The "New event" button puts the event on the day the calendar is on, not simply on today.
import { describe, expect, it } from "vitest";
import { newEventSlot, nextFullHour } from "./new-event-day";

const nextHour = { date: "2026-11-14", span: { startMin: 15 * 60, endMin: 16 * 60 } };
const base = { today: "2026-11-14", nextHour, dayStartHour: 7 };

describe("the New event button's day", () => {
  it("is today at the next full hour when the calendar is on today", () => {
    expect(newEventSlot({ ...base, date: "2026-11-14" })).toEqual(nextHour);
  });

  it("is the shown day at 9am when the calendar is on another day, also in the same week as today", () => {
    expect(newEventSlot({ ...base, date: "2026-11-16" })).toEqual({ date: "2026-11-16", span: { startMin: 540, endMin: 600 } });
    expect(newEventSlot({ ...base, date: "2026-11-12" })).toEqual({ date: "2026-11-12", span: { startMin: 540, endMin: 600 } });
    expect(newEventSlot({ ...base, date: "2026-12-03" }).date).toBe("2026-12-03");
  });

  it("starts at the day's first visible hour when that is after 9am", () => {
    expect(newEventSlot({ ...base, date: "2026-11-16", dayStartHour: 11 }).span).toEqual({ startMin: 660, endMin: 720 });
  });
});

describe("the next full hour on the user's wall clock", () => {
  it("is the coming hour, one hour long", () => {
    expect(nextFullHour("2026-11-14T10:10")).toEqual({ date: "2026-11-14", span: { startMin: 660, endMin: 720 } });
    expect(nextFullHour("2026-11-14T10:59")).toEqual({ date: "2026-11-14", span: { startMin: 660, endMin: 720 } });
  });

  it("stays when the clock is exactly on the hour", () => {
    expect(nextFullHour("2026-11-14T10:00")).toEqual({ date: "2026-11-14", span: { startMin: 600, endMin: 660 } });
  });

  it("moves to the next day late at night, also at a month's end", () => {
    expect(nextFullHour("2026-11-14T23:30")).toEqual({ date: "2026-11-15", span: { startMin: 0, endMin: 60 } });
    expect(nextFullHour("2026-11-30T23:05").date).toBe("2026-12-01");
  });
});
