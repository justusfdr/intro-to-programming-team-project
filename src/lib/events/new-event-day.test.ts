// The "New event" button puts the event on the day the calendar is on, not simply on today.
import { describe, expect, it } from "vitest";
import { newEventSlot } from "./new-event-day";

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
