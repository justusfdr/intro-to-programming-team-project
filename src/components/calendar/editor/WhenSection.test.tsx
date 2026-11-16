// The end picked on the wheel or typed in the editor: a time of day (00:00 to 23:59), on the start's day
// when it is after the start, on the next day when it is at or before the start (an event past midnight).
import { describe, expect, it } from "vitest";
import { endFromPicked, repeatSummary } from "./WhenSection";

const at = (h: number, m = 0) => h * 60 + m;

describe("endFromPicked", () => {
  it("keeps an end after the start on the same day", () => {
    expect(endFromPicked(at(9), at(10))).toBe(at(10));
    expect(endFromPicked(at(9), at(23, 59))).toBe(at(23, 59));
    expect(endFromPicked(at(9), at(9, 15))).toBe(at(9, 15));
  });

  it("puts an end at or before the start on the next day", () => {
    expect(endFromPicked(at(22), at(2))).toBe(at(26));
    expect(endFromPicked(at(22), at(0))).toBe(at(24));
    // The same time as the start: a whole day.
    expect(endFromPicked(at(9), at(9))).toBe(at(33));
  });
});

describe("repeatSummary", () => {
  it("says the repeat in words, as in Teams", () => {
    expect(repeatSummary("none", [], "")).toBe("");
    expect(repeatSummary("daily", [], "")).toBe("Every day");
    expect(repeatSummary("weekly", [3, 1], "")).toBe("Every week on Mon, Wed");
    expect(repeatSummary("monthly", [], "2026-12-20")).toMatch(/^Every month until .*20/);
  });
});
