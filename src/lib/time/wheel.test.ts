// The time wheel's rules: hours 00 to 23, minutes 00 to 59, typed as "HH:MM". Every accepted and every
// rejected input is checked, and every one of the 1440 times of a day goes there and back.
import { describe, expect, it } from "vitest";
import {
  HOURS,
  LAST_MINUTE,
  MINUTES,
  endProblem,
  formatHHMM,
  indexAtScroll,
  maskTimeTyping,
  parseHHMM,
  withHour,
  withMinute,
} from "./wheel";

describe("the wheel's columns", () => {
  it("hours go from 00 to 23, nothing else", () => {
    expect(HOURS).toHaveLength(24);
    expect(HOURS[0]).toBe(0);
    expect(HOURS[23]).toBe(23);
  });

  it("minutes go from 00 to 59, every minute", () => {
    expect(MINUTES).toHaveLength(60);
    expect(MINUTES[0]).toBe(0);
    expect(MINUTES[59]).toBe(59);
  });

  it("the last minute of the day is 23:59", () => {
    expect(LAST_MINUTE).toBe(23 * 60 + 59);
  });
});

describe("formatHHMM", () => {
  it("always writes two digits, a colon and two digits", () => {
    expect(formatHHMM(0)).toBe("00:00");
    expect(formatHHMM(5)).toBe("00:05");
    expect(formatHHMM(9 * 60)).toBe("09:00");
    expect(formatHHMM(13 * 60 + 7)).toBe("13:07");
    expect(formatHHMM(LAST_MINUTE)).toBe("23:59");
  });
});

describe("parseHHMM: accepted", () => {
  it("every time of the day, written as HH:MM, comes back as the same minute", () => {
    for (let min = 0; min <= LAST_MINUTE; min++) {
      expect(parseHHMM(formatHHMM(min))).toEqual({ ok: true, min });
    }
  });

  it("the edges: 00:00, 00:59, 23:00 and 23:59", () => {
    expect(parseHHMM("00:00")).toEqual({ ok: true, min: 0 });
    expect(parseHHMM("00:59")).toEqual({ ok: true, min: 59 });
    expect(parseHHMM("23:00")).toEqual({ ok: true, min: 1380 });
    expect(parseHHMM("23:59")).toEqual({ ok: true, min: 1439 });
  });
});

describe("parseHHMM: rejected, with a message that says why", () => {
  const FORMAT = "Enter the time as HH:MM, for example 09:30";
  const HOUR = "Hours go from 00 to 23";
  const MINUTE = "Minutes go from 00 to 59";

  it.each([
    ["24:00", HOUR],
    ["25:30", HOUR],
    ["99:00", HOUR],
    ["30:00", HOUR],
  ])("%s: the hour is too big", (text, message) => {
    expect(parseHHMM(text)).toEqual({ ok: false, message });
  });

  it.each([
    ["12:60", MINUTE],
    ["00:99", MINUTE],
    ["23:75", MINUTE],
  ])("%s: the minute is too big", (text, message) => {
    expect(parseHHMM(text)).toEqual({ ok: false, message });
  });

  it("an hour and a minute that are both too big: the hour is named first", () => {
    expect(parseHHMM("24:60")).toEqual({ ok: false, message: HOUR });
  });

  it.each(["", "9", "9:00", "09", "09:", "09:3", "0930", "9:5", "123:45", "12:345", "ab:cd", "1a:00", "12:3b", "-1:00", "12-30", "12.30", " 12:30", "12:30 ", "12 :30", "１２:３０"])(
    "%j: not two digits, a colon and two digits",
    (text) => {
      expect(parseHHMM(text)).toEqual({ ok: false, message: FORMAT });
    },
  );
});

describe("maskTimeTyping: what the field shows while typing", () => {
  it.each([
    ["", ""],
    ["0", "0"],
    ["09", "09"],
    ["093", "09:3"],
    ["0930", "09:30"],
    ["09:30", "09:30"],
    ["09:3", "09:3"],
    ["09:", "09"],
    ["2359", "23:59"],
    ["12345", "12:34"],
    ["12:345", "12:34"],
    ["ab", ""],
    ["1a2b", "12"],
    ["9.30", "93:0"],
    [" 0 9 3 0 ", "09:30"],
  ])("%j becomes %j", (typed, shown) => {
    expect(maskTimeTyping(typed)).toBe(shown);
  });

  it("only ever shows digits and at most one colon, and never more than 5 characters", () => {
    for (const typed of ["99999999", "::::", "1:2:3:4", "abc123def456"]) {
      const shown = maskTimeTyping(typed);
      expect(shown.length).toBeLessThanOrEqual(5);
      expect(shown).toMatch(/^\d{0,2}(:\d{0,2})?$/);
    }
  });
});

describe("indexAtScroll: which row stands in the middle of a column", () => {
  it("rounds to the nearest row", () => {
    expect(indexAtScroll(0, 32, 24)).toBe(0);
    expect(indexAtScroll(15, 32, 24)).toBe(0);
    expect(indexAtScroll(16, 32, 24)).toBe(1);
    expect(indexAtScroll(32 * 9, 32, 24)).toBe(9);
    expect(indexAtScroll(32 * 9 + 20, 32, 24)).toBe(10);
  });

  it("never leaves the column, even when scrolled too far (bounce)", () => {
    expect(indexAtScroll(-50, 32, 24)).toBe(0);
    expect(indexAtScroll(32 * 40, 32, 24)).toBe(23);
    expect(indexAtScroll(32 * 80, 32, 60)).toBe(59);
  });

  it("a broken row height gives the first row, not NaN", () => {
    expect(indexAtScroll(100, 0, 24)).toBe(0);
    expect(indexAtScroll(Number.NaN, 32, 24)).toBe(0);
  });
});

describe("withHour and withMinute: turning one column keeps the other", () => {
  it("a new hour keeps the minute", () => {
    expect(withHour(9 * 60 + 45, 14)).toBe(14 * 60 + 45);
    expect(withHour(0, 23)).toBe(23 * 60);
  });

  it("a new minute keeps the hour", () => {
    expect(withMinute(9 * 60 + 45, 5)).toBe(9 * 60 + 5);
    expect(withMinute(23 * 60, 59)).toBe(LAST_MINUTE);
  });

  it("a value outside the columns is refused: the time stays as it was", () => {
    expect(withHour(600, 24)).toBe(600);
    expect(withHour(600, -1)).toBe(600);
    expect(withHour(600, 1.5)).toBe(600);
    expect(withMinute(600, 60)).toBe(600);
    expect(withMinute(600, -1)).toBe(600);
  });
});

describe("endProblem: the end must come at least 15 minutes after the start", () => {
  it("accepted: 15 minutes or more after the start", () => {
    expect(endProblem(9 * 60, 9 * 60 + 15)).toBeNull();
    expect(endProblem(9 * 60, 10 * 60)).toBeNull();
    expect(endProblem(0, LAST_MINUTE)).toBeNull();
  });

  it("rejected: the same time, too short, or before the start", () => {
    const message = "The end must be at least 15 minutes after the start";
    expect(endProblem(9 * 60, 9 * 60)).toBe(message);
    expect(endProblem(9 * 60, 9 * 60 + 14)).toBe(message);
    expect(endProblem(10 * 60, 9 * 60)).toBe(message);
    expect(endProblem(23 * 60 + 50, LAST_MINUTE)).toBe(message);
  });
});
