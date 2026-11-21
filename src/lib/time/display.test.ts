// The display rule for times and dates (spec 12): as the prototype shows them.
import { describe, expect, it } from "vitest";
import { fmtDateLong, fmtDateShort, fmtDateShortFrom, fmtDayMonth, fmtHour, fmtHourSetting, fmtMinutes, fmtRange, fmtTime, fmtWeekRange, fmtWeekday } from "./display";

describe("times", () => {
  it("12-hour: '9am', '9:30am', '12pm', '12am', '1:30pm'", () => {
    expect(fmtTime("09:00", "12h")).toBe("9am");
    expect(fmtTime("09:30", "12h")).toBe("9:30am");
    expect(fmtTime("12:00", "12h")).toBe("12pm");
    expect(fmtTime("00:00", "12h")).toBe("12am");
    expect(fmtTime(13 * 60 + 30, "12h")).toBe("1:30pm");
  });

  it("24-hour: '9:00', '13:30', and minutes past 24 hours wrap to the clock", () => {
    expect(fmtTime("09:00", "24h")).toBe("9:00");
    expect(fmtTime("13:30", "24h")).toBe("13:30");
    expect(fmtTime(26 * 60, "24h")).toBe("2:00");
  });

  it("ranges as in the prototype: '9 – 10:30am' in one half of the day, '11am – 1pm' across noon", () => {
    expect(fmtRange("09:00", "10:30", "12h")).toBe("9 – 10:30am");
    expect(fmtRange("11:00", "13:00", "12h")).toBe("11am – 1pm");
    expect(fmtRange("09:00", "10:30", "24h")).toBe("9:00 – 10:30");
  });

  it("hour labels '9am' or '9:00', and 'Midnight' or '24:00' for the end of the visible hours", () => {
    expect(fmtHour(9, "12h")).toBe("9am");
    expect(fmtHour(0, "12h")).toBe("12am");
    expect(fmtHour(21, "24h")).toBe("21:00");
    expect(fmtHourSetting(24, "12h")).toBe("Midnight");
    expect(fmtHourSetting(24, "24h")).toBe("24:00");
  });

  it("lengths '45m', '1h', '1h 30m'", () => {
    expect(fmtMinutes(45)).toBe("45m");
    expect(fmtMinutes(60)).toBe("1h");
    expect(fmtMinutes(90)).toBe("1h 30m");
  });
});

describe("dates, month first", () => {
  it("'Nov 7', 'Sat, Nov 7', 'Saturday, November 7', 'Sat'", () => {
    expect(fmtDayMonth("2026-11-07")).toBe("Nov 7");
    expect(fmtDateShort("2026-11-07")).toBe("Sat, Nov 7");
    expect(fmtDateLong("2026-11-07")).toBe("Saturday, November 7");
    expect(fmtWeekday("2026-11-07")).toBe("Sat");
  });

  it("a week: 'Nov 16 – 22', or 'Nov 30 – Dec 6' across two months", () => {
    expect(fmtWeekRange("2026-11-16")).toBe("Nov 16 – 22");
    expect(fmtWeekRange("2026-11-30")).toBe("Nov 30 – Dec 6");
    expect(fmtWeekRange("2026-12-28")).toBe("Dec 28 – Jan 3");
  });
});

describe("fmtDateShortFrom (spec 66)", () => {
  it("adds the year only when it is not today's year", () => {
    expect(fmtDateShortFrom("2026-12-17", "2026-11-21")).toBe("Thu, Dec 17");
    expect(fmtDateShortFrom("2027-11-17", "2026-11-21")).toBe("Wed, Nov 17, 2027");
    expect(fmtDateShortFrom("2025-11-17", "2026-11-21")).toBe("Mon, Nov 17, 2025");
  });
});
