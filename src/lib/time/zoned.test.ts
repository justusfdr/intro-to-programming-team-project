import { describe, expect, it } from "vitest";
import {
  addDays,
  dayLabel,
  isLocalDate,
  localDateOf,
  localDateTimeOf,
  localTimeOf,
  mondayOf,
  parseLocalDateTime,
  startOfLocalDate,
  weekOf,
} from "./zoned";

const LISBON = "Europe/Lisbon";
const HOUR = 3_600_000;

describe("weeks run Monday 00:00 to Sunday 24:00 in the user's time zone (R2)", () => {
  it("finds the Monday for every day of a week", () => {
    for (const day of ["2026-11-16", "2026-11-18", "2026-11-22"]) expect(mondayOf(day)).toBe("2026-11-16");
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28"); // across a year
  });

  it("gives the week's days and its start and end as instants", () => {
    const week = weekOf("2026-11-18", LISBON); // Lisbon is on UTC in November
    expect(week.days).toEqual([
      "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22",
    ]);
    expect(week.startsAt.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(week.endsAt.toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });

  it("starts the week at local midnight in another zone (New York, UTC−5 in November)", () => {
    const week = weekOf("2026-11-16", "America/New_York");
    expect(week.startsAt.toISOString()).toBe("2026-11-16T05:00:00.000Z");
  });

  it("puts Sunday 23:30 to Monday 00:30 on Sunday, in that week (spec 02)", () => {
    const start = parseLocalDateTime("2026-11-22T23:30", LISBON)!;
    const week = weekOf("2026-11-16", LISBON);
    expect(localDateOf(start, LISBON)).toBe("2026-11-22");
    expect(start >= week.startsAt && start < week.endsAt).toBe(true);
    // The same event seen from New York starts on Sunday 18:30 there: still that week.
    expect(localDateOf(start, "America/New_York")).toBe("2026-11-22");
  });

  it("has 169 hours in the week the clocks go back (Lisbon, Sunday 25 October 2026)", () => {
    const week = weekOf("2026-10-21", LISBON);
    expect(week.startsAt.toISOString()).toBe("2026-10-18T23:00:00.000Z"); // Monday 00:00 summer time
    expect(week.endsAt.toISOString()).toBe("2026-10-26T00:00:00.000Z"); // Monday 00:00 winter time
    expect((week.endsAt.getTime() - week.startsAt.getTime()) / HOUR).toBe(169);
  });

  it("has 167 hours in the week the clocks go forward (Lisbon, Sunday 29 March 2026)", () => {
    const week = weekOf("2026-03-25", LISBON);
    expect((week.endsAt.getTime() - week.startsAt.getTime()) / HOUR).toBe(167);
    // 09:00 on the Monday after the change is 08:00 UTC (summer time).
    expect(parseLocalDateTime("2026-03-30T09:00", LISBON)!.toISOString()).toBe("2026-03-30T08:00:00.000Z");
  });
});

describe("reading and showing local times", () => {
  it("reads a datetime-local value in the user's time zone", () => {
    expect(parseLocalDateTime("2026-11-16T09:00", LISBON)!.toISOString()).toBe("2026-11-16T09:00:00.000Z");
    expect(parseLocalDateTime("2026-07-16T09:00", LISBON)!.toISOString()).toBe("2026-07-16T08:00:00.000Z");
    expect(parseLocalDateTime("2026-11-16T09:00", "Asia/Kolkata")!.toISOString()).toBe("2026-11-16T03:30:00.000Z");
  });

  it.each(["2026-02-30T09:00", "2026-11-16T24:00", "2026-11-16 09:00", "16/11/2026 09:00", "", "2026-11-16T9:00"])(
    "rejects %j",
    (value) => {
      expect(parseLocalDateTime(value, LISBON)).toBeNull();
    },
  );

  it("shows an instant as local date, time and datetime-local value", () => {
    const instant = new Date("2026-07-16T08:00:00Z");
    expect(localDateOf(instant, LISBON)).toBe("2026-07-16");
    expect(localTimeOf(instant, LISBON)).toBe("09:00");
    expect(localDateTimeOf(instant, LISBON)).toBe("2026-07-16T09:00");
  });

  it("counts days on the calendar, not in 24-hour steps", () => {
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(startOfLocalDate("2026-10-26", LISBON).getTime() - startOfLocalDate("2026-10-25", LISBON).getTime()).toBe(25 * HOUR);
  });

  it("checks local dates and labels them", () => {
    expect(isLocalDate("2026-11-16")).toBe(true);
    expect(isLocalDate("2026-13-01")).toBe(false);
    expect(isLocalDate("2026-11-16x")).toBe(false);
    expect(dayLabel("2026-11-16")).toBe("Mon 16 Nov");
  });
});
