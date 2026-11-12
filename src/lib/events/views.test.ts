// The calendar's view helpers (spec 14), adapted from the first prototype's views.test.ts to local
// dates and without seasons.
import { describe, expect, it } from "vitest";
import {
  addMonths,
  allowedViews,
  calendarHref,
  coerceView,
  isTypingTarget,
  navLabel,
  readAddress,
  shortcutFor,
  stepDate,
  viewLabel,
  viewSubtitle,
  viewSubtitleShort,
  viewTitle,
  visibleDays,
} from "./views";

const FRI = "2026-11-06"; // week Mon Nov 2 – Sun Nov 8

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("views", () => {
  it("labels each view", () => {
    expect(["day", "week", "month"].map((v) => viewLabel(v as "day"))).toEqual(["Day", "Week", "Month"]);
  });

  it("shows one day, the week from Monday, or 42 days from the Monday before the 1st", () => {
    expect(visibleDays("day", FRI)).toEqual([FRI]);
    const week = visibleDays("week", FRI);
    expect([week.length, week[0], week[6]]).toEqual([7, "2026-11-02", "2026-11-08"]);
    const month = visibleDays("month", FRI);
    expect([month.length, month[0], month[41]]).toEqual([42, "2026-10-26", "2026-12-06"]);
    // A month that starts on a Monday starts the grid with its 1st.
    expect(visibleDays("month", "2027-02-10")[0]).toBe("2027-02-01");
  });

  it("steps by a day, a week or a month (kept inside the month, across years)", () => {
    expect([stepDate("day", FRI, 1), stepDate("day", FRI, -1)]).toEqual(["2026-11-07", "2026-11-05"]);
    expect([stepDate("week", FRI, 1), stepDate("week", FRI, -1)]).toEqual(["2026-11-13", "2026-10-30"]);
    expect(stepDate("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(stepDate("month", "2027-01-15", -1)).toBe("2026-12-15");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("titles: day and month the month and year; a week across months or years shortened", () => {
    expect([viewTitle("day", FRI), viewTitle("month", FRI), viewTitle("week", "2026-11-04")]).toEqual(["November 2026", "November 2026", "November 2026"]);
    expect(viewTitle("week", "2026-10-28")).toBe("Oct – Nov 2026");
    expect(viewTitle("week", "2026-12-30")).toBe("Dec 2026 – Jan 2027");
  });

  it("subtitles: the week's number and days, the day with its week, the month nothing", () => {
    expect(viewSubtitle("week", "2026-11-18")).toBe("Week 47 · Nov 16 – 22");
    expect(viewSubtitle("day", "2026-11-18")).toBe("Wednesday, Nov 18 · Week 47");
    expect(viewSubtitleShort("day", "2026-11-18")).toBe("Wed, Nov 18 · Week 47");
    expect(viewSubtitleShort("week", "2026-11-18")).toBe(viewSubtitle("week", "2026-11-18"));
    expect(viewSubtitle("month", "2026-11-18")).toBe("");
  });

  it("names the buttons and keeps phones to day and month", () => {
    expect([navLabel("day", -1), navLabel("month", 1)]).toEqual(["Previous day", "Next month"]);
    expect(allowedViews(true)).toEqual(["day", "month"]);
    expect(allowedViews(false)).toEqual(["day", "week", "month"]);
    expect([coerceView("week", true), coerceView("week", false), coerceView("month", true)]).toEqual(["day", "week", "month"]);
  });
});

describe("the address", () => {
  it("writes the view and the day, or only the view for today", () => {
    expect(calendarHref("day", "2026-11-18")).toBe("/?view=day&date=2026-11-18");
    expect(calendarHref("month")).toBe("/?view=month");
  });

  it("reads the view and the day, the older week link, and drops anything else", () => {
    expect(readAddress({ view: "month", date: "2026-11-18" })).toEqual({ view: "month", date: "2026-11-18" });
    expect(readAddress({ week: "2026-11-25" })).toEqual({ view: undefined, date: "2026-11-25" });
    expect(readAddress({ view: "year", date: "2026-13-01" })).toEqual({ view: undefined, date: undefined });
    expect(readAddress({ view: ["day", "week"], date: ["2026-11-18"] })).toEqual({ view: undefined, date: undefined });
  });
});

describe("keyboard shortcuts", () => {
  it("D, W, M switch the view, T goes to today, the arrows step", () => {
    expect(shortcutFor(key("d"))).toEqual({ type: "view", view: "day" });
    expect(shortcutFor(key("W"))).toEqual({ type: "view", view: "week" });
    expect(shortcutFor(key("m"))).toEqual({ type: "view", view: "month" });
    expect(shortcutFor(key("t"))).toEqual({ type: "today" });
    expect(shortcutFor(key("ArrowLeft"))).toEqual({ type: "step", dir: -1 });
    expect(shortcutFor(key("ArrowRight"))).toEqual({ type: "step", dir: 1 });
    expect(shortcutFor(key("x"))).toBeNull();
  });

  it("does nothing with a modifier key", () => {
    expect(shortcutFor(key("d", { metaKey: true }))).toBeNull();
    expect(shortcutFor(key("t", { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key("ArrowLeft", { altKey: true }))).toBeNull();
    expect(shortcutFor(key("M", { shiftKey: true }))).toBeNull();
  });

  it("knows when the user is typing in a field", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "textarea" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
