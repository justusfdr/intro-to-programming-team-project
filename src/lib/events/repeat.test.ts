import { describe, expect, it } from "vitest";
import { repeatDates, weekdayOf } from "./repeat";

describe("repeating dates (R28)", () => {
  it("A12: weekly on Tue and Thu from Tue 17 Nov 2026 until 18 Dec: 10 dates", () => {
    expect(repeatDates("2026-11-17", { frequency: "weekly", weekdays: [2, 4], until: "2026-12-18" })).toEqual([
      "2026-11-17", "2026-11-19", "2026-11-24", "2026-11-26", "2026-12-01",
      "2026-12-03", "2026-12-08", "2026-12-10", "2026-12-15", "2026-12-17",
    ]);
  });

  it("always includes the first date's weekday in a weekly series", () => {
    expect(repeatDates("2026-11-17", { frequency: "weekly", weekdays: [4], until: "2026-11-26" })).toEqual([
      "2026-11-17", "2026-11-19", "2026-11-24", "2026-11-26",
    ]);
    expect(repeatDates("2026-11-17", { frequency: "weekly", weekdays: [], until: "2026-12-01" })).toEqual(["2026-11-17", "2026-11-24", "2026-12-01"]);
  });

  it("repeats daily until repeat_until, both ends included", () => {
    expect(repeatDates("2026-11-30", { frequency: "daily", weekdays: [], until: "2026-12-02" })).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(repeatDates("2026-11-30", { frequency: "daily", weekdays: [], until: "2026-11-30" })).toEqual(["2026-11-30"]);
  });

  it("repeats monthly on the same day and skips months without it (31 Jan until 30 Jun 2027)", () => {
    expect(repeatDates("2027-01-31", { frequency: "monthly", weekdays: [], until: "2027-06-30" })).toEqual(["2027-01-31", "2027-03-31", "2027-05-31"]);
    expect(repeatDates("2026-11-15", { frequency: "monthly", weekdays: [], until: "2027-02-14" })).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
  });

  it("allows 100 dates and refuses 101 (A12)", () => {
    const hundred = repeatDates("2026-11-17", { frequency: "daily", weekdays: [], until: "2027-02-24" });
    expect(Array.isArray(hundred) && hundred.length).toBe(100);
    expect(repeatDates("2026-11-17", { frequency: "daily", weekdays: [], until: "2027-02-25" })).toBe("too_many");
  });

  it("knows the weekday of a date (Mon 16 Nov 2026 = 1, Sun 22 Nov = 7)", () => {
    expect([weekdayOf("2026-11-16"), weekdayOf("2026-11-22")]).toEqual([1, 7]);
  });
});
