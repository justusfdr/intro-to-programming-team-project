// A click in the all-day row opens the editor for a new all-day event on that day.
import { describe, expect, it } from "vitest";
import { newValues } from "./values";

describe("a new event started from the all-day row", () => {
  it("is all day on the clicked day, and keeps an hour to fall back on when switched to timed", () => {
    const values = newValues({ start: "2026-11-18T09:00", end: "2026-11-18T10:00", allDay: true });
    expect(values).toMatchObject({ allDay: true, firstDay: "2026-11-18", lastDay: "2026-11-18", date: "2026-11-18", startMin: 9 * 60, endMin: 10 * 60 });
  });

  it("a new event from the hours stays timed", () => {
    expect(newValues({ start: "2026-11-18T09:00", end: "2026-11-18T10:00" }).allDay).toBe(false);
  });
});
