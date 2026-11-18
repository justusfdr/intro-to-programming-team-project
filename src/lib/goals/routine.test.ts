// A goal's routine (spec 41, R44): the lists, the saved text of the avoided days, the two "week must
// fit" limits, and the check of a whole routine with its rules, accepted and rejected.
import { describe, expect, it } from "vitest";
import {
  avoidDaysFromText,
  avoidDaysToText,
  cleanRoutine,
  DAY_PART_HOURS,
  DAY_PARTS,
  EMPTY_ROUTINE,
  GOAL_CATEGORIES,
  hasRoutine,
  isDayPart,
  isGoalCategory,
  isWeekday,
  maxEventsPerWeek,
  maxHoursPerWeek,
  routineProblem,
  WEEKDAYS,
  type RoutineInput,
} from "./routine";

const NONE: RoutineInput = { category: null, categoryOther: null, sessionMinutes: null, dayPart: null, avoidDays: null, location: null };
const TWO_RUNS = [{ kind: "count" as const, target: 2 }];

describe("the lists", () => {
  it("has the five categories, the three parts of the day with their hours, and the weekdays Monday first", () => {
    expect(GOAL_CATEGORIES).toEqual(["sport", "uni", "work", "personal", "other"]);
    expect(DAY_PARTS).toEqual(["morning", "afternoon", "evening"]);
    expect(DAY_PART_HOURS.morning).toMatchObject({ from: 0, until: 12 });
    expect(DAY_PART_HOURS.afternoon).toMatchObject({ from: 12, until: 17 });
    expect(DAY_PART_HOURS.evening).toMatchObject({ from: 17, until: 24 });
    expect(WEEKDAYS.map((d) => [d.day, d.short, d.long])).toEqual([
      [1, "Mon", "Monday"],
      [2, "Tue", "Tuesday"],
      [3, "Wed", "Wednesday"],
      [4, "Thu", "Thursday"],
      [5, "Fri", "Friday"],
      [6, "Sat", "Saturday"],
      [7, "Sun", "Sunday"],
    ]);
  });

  it("recognises the values and nothing else", () => {
    expect(isGoalCategory("uni")).toBe(true);
    expect(isGoalCategory("Uni")).toBe(false);
    expect(isGoalCategory(null)).toBe(false);
    expect(isDayPart("evening")).toBe(true);
    expect(isDayPart("night")).toBe(false);
    expect(isWeekday(1)).toBe(true);
    expect(isWeekday(7)).toBe(true);
    expect(isWeekday(0)).toBe(false);
    expect(isWeekday(8)).toBe(false);
    expect(isWeekday(1.5)).toBe(false);
    expect(isWeekday("1")).toBe(false);
  });
});

describe("the avoided days as saved text", () => {
  it("writes the digits once, in rising order", () => {
    expect(avoidDaysToText([])).toBe("");
    expect(avoidDaysToText([5])).toBe("5");
    expect(avoidDaysToText([7, 6])).toBe("67");
    expect(avoidDaysToText([3, 1, 3])).toBe("13");
  });

  it("reads them back as a sorted list, leaving out anything else", () => {
    expect(avoidDaysFromText("")).toEqual([]);
    expect(avoidDaysFromText("67")).toEqual([6, 7]);
    expect(avoidDaysFromText("51")).toEqual([1, 5]);
    expect(avoidDaysFromText("8a05")).toEqual([5]);
  });
});

describe("the week must fit (R44)", () => {
  it("allows two events a day on the days left", () => {
    expect([0, 1, 2, 5, 6].map(maxEventsPerWeek)).toEqual([14, 12, 10, 4, 2]);
  });

  it("allows 12 hours a day on the days left, never more than 60", () => {
    expect([0, 1, 2, 3, 6].map(maxHoursPerWeek)).toEqual([60, 60, 60, 48, 12]);
  });
});

describe("hasRoutine", () => {
  it("is false for an empty routine and true as soon as one field is set", () => {
    expect(hasRoutine(EMPTY_ROUTINE)).toBe(false);
    expect(hasRoutine({ ...EMPTY_ROUTINE, category: "sport" })).toBe(true);
    expect(hasRoutine({ ...EMPTY_ROUTINE, sessionMinutes: 60 })).toBe(true);
    expect(hasRoutine({ ...EMPTY_ROUTINE, dayPart: "morning" })).toBe(true);
    expect(hasRoutine({ ...EMPTY_ROUTINE, avoidDays: [7] })).toBe(true);
    expect(hasRoutine({ ...EMPTY_ROUTINE, location: "Gym" })).toBe(true);
  });
});

describe("routineProblem accepts", () => {
  it.each<[string, Partial<RoutineInput>]>([
    ["nothing set", {}],
    ["each category", { category: "personal" }],
    ["'other' with an own word of 30 characters", { category: "other", categoryOther: "m".repeat(30) }],
    ["'other' without an own word", { category: "other", categoryOther: "   " }],
    ["an own word with another category (it is dropped)", { category: "sport", categoryOther: "x".repeat(99) }],
    ["1 and 720 minutes", { sessionMinutes: 720 }],
    ["any minute in between", { sessionMinutes: 50 }],
    ["each part of the day", { dayPart: "afternoon" }],
    ["six avoided days in any order", { avoidDays: [6, 1, 2, 3, 4, 5] }],
    ["an empty list of days", { avoidDays: [] }],
    ["a location of 200 characters with spaces around it", { location: `  ${"l".repeat(200)}  ` }],
  ])("%s", (_name, change) => {
    expect(routineProblem({ ...NONE, ...change }, TWO_RUNS)).toBeNull();
  });

  it("15 minutes and every category", () => {
    expect(routineProblem({ ...NONE, sessionMinutes: 15 }, TWO_RUNS)).toBeNull();
    for (const category of GOAL_CATEGORIES) expect(routineProblem({ ...NONE, category }, TWO_RUNS)).toBeNull();
  });
});

describe("routineProblem rejects", () => {
  it.each<[string, Partial<RoutineInput>, string, string]>([
    ["a category outside the list", { category: "music" }, "goal_category", "Choose a category from the list"],
    ["an own word of 31 characters", { category: "other", categoryOther: "m".repeat(31) }, "category_other_length", "Your own category can be at most 30 characters"],
    ["an own word with a line break", { category: "other", categoryOther: "Mu\nsic" }, "category_other_form", "Your own category must be on one line, without control characters"],
    ["an own word with a zero-width space", { category: "other", categoryOther: "Mu​sic" }, "category_other_form", "Your own category must be on one line, without control characters"],
    ["0 minutes", { sessionMinutes: 0 }, "session_minutes", "A session lasts 1 minute to 12 hours"],
    ["721 minutes", { sessionMinutes: 721 }, "session_minutes", "A session lasts 1 minute to 12 hours"],
    ["22.5 minutes", { sessionMinutes: 22.5 }, "session_minutes", "A session lasts 1 minute to 12 hours"],
    ["a part of the day outside the list", { dayPart: "night" }, "day_part", "Choose morning, afternoon, evening or any time"],
    ["a day 0", { avoidDays: [0] }, "avoid_days", "Choose weekdays from the list"],
    ["a day 8", { avoidDays: [8] }, "avoid_days", "Choose weekdays from the list"],
    ["a day twice", { avoidDays: [5, 5] }, "avoid_days", "Choose weekdays from the list"],
    ["half a day", { avoidDays: [1.5] }, "avoid_days", "Choose weekdays from the list"],
    ["all seven days", { avoidDays: [1, 2, 3, 4, 5, 6, 7] }, "avoid_all_days", "A goal needs at least one day of the week"],
    ["a location of 201 characters", { location: "l".repeat(201) }, "location_length", "Location can be at most 200 characters"],
  ])("%s", (_name, change, error, message) => {
    expect(routineProblem({ ...NONE, ...change }, TWO_RUNS)).toEqual({ error, message });
  });

  it("names the first problem in the ontology's order", () => {
    expect(routineProblem({ ...NONE, category: "x", sessionMinutes: 1, dayPart: "x" }, TWO_RUNS)?.error).toBe("goal_category");
    expect(routineProblem({ ...NONE, sessionMinutes: 0, dayPart: "x", avoidDays: [9] }, TWO_RUNS)?.error).toBe("session_minutes");
    expect(routineProblem({ ...NONE, dayPart: "x", avoidDays: [9] }, TWO_RUNS)?.error).toBe("day_part");
    expect(routineProblem({ ...NONE, avoidDays: [9], location: "l".repeat(201) }, TWO_RUNS)?.error).toBe("avoid_days");
    expect(routineProblem({ ...NONE, location: "l".repeat(201), avoidDays: [1, 2, 3, 4, 5, 6] }, [{ kind: "count", target: 14 }])?.error).toBe(
      "location_length",
    );
  });
});

describe("routineProblem: the week must fit (R44)", () => {
  it("count rules: at the limit fine, one above refused with the number", () => {
    expect(routineProblem({ ...NONE, avoidDays: [6, 7] }, [{ kind: "count", target: 10 }])).toBeNull();
    expect(routineProblem({ ...NONE, avoidDays: [6, 7] }, [{ kind: "count", target: 11 }])).toEqual({
      error: "week_count_fit",
      message: "With these days ruled out, at most 10 events a week fit",
    });
  });

  it("hours rules: at the limit fine, half an hour above refused with the number", () => {
    expect(routineProblem({ ...NONE, avoidDays: [5, 6, 7] }, [{ kind: "hours", target: 48 }])).toBeNull();
    expect(routineProblem({ ...NONE, avoidDays: [5, 6, 7] }, [{ kind: "hours", target: 48.5 }])).toEqual({
      error: "week_hours_fit",
      message: "With these days ruled out, at most 48 hours a week fit",
    });
  });

  it("checks every rule of the goal", () => {
    const rules = [
      { kind: "count" as const, target: 2 },
      { kind: "count" as const, target: 3 },
    ];
    expect(routineProblem({ ...NONE, avoidDays: [1, 2, 3, 4, 5, 6] }, rules)?.message).toBe("With these days ruled out, at most 2 events a week fit");
  });

  it("without avoided days only R7's own limits apply", () => {
    expect(routineProblem(NONE, [{ kind: "count", target: 14 }, { kind: "hours", target: 60 }])).toBeNull();
  });
});

describe("cleanRoutine", () => {
  it("trims, drops empty texts, keeps the own word only with 'other' and sorts the days", () => {
    expect(
      cleanRoutine({ category: "other", categoryOther: "  Music ", sessionMinutes: 45, dayPart: "evening", avoidDays: [7, 6], location: "  Studio  " }),
    ).toEqual({ category: "other", categoryOther: "Music", sessionMinutes: 45, dayPart: "evening", avoidDays: [6, 7], mustDays: [], dayFrom: null, dayUntil: null, location: "Studio" });
    expect(cleanRoutine({ ...NONE, category: "sport", categoryOther: "Music", location: "   " })).toEqual({ ...EMPTY_ROUTINE, category: "sport" });
    expect(cleanRoutine(NONE)).toEqual(EMPTY_ROUTINE);
  });
});

describe("the sure days (mustDays)", () => {
  const COUNT3 = [{ kind: "count" as const, target: 3 }];

  it("accepts up to one sure day per session a week, and none at all", () => {
    expect(routineProblem({ ...NONE, mustDays: [1, 3, 5] }, COUNT3)).toBeNull();
    expect(routineProblem({ ...NONE, mustDays: [] }, COUNT3)).toBeNull();
    expect(routineProblem(NONE, COUNT3)).toBeNull();
  });

  it("refuses more sure days than sessions a week, with the number", () => {
    expect(routineProblem({ ...NONE, mustDays: [1, 2, 3, 4] }, COUNT3)).toEqual({
      error: "must_days_count",
      message: "You can choose at most 3 sure days, one for each session a week",
    });
  });

  it("refuses a day that is also ruled out", () => {
    expect(routineProblem({ ...NONE, avoidDays: [5], mustDays: [1, 5] }, COUNT3)?.error).toBe("must_avoid_day");
  });

  it("refuses anything that is not a weekday, or a day twice", () => {
    expect(routineProblem({ ...NONE, mustDays: [0] }, COUNT3)?.error).toBe("must_days");
    expect(routineProblem({ ...NONE, mustDays: [2, 2] }, COUNT3)?.error).toBe("must_days");
  });

  it("is cleaned sorted, and counts as a routine", () => {
    expect(cleanRoutine({ ...NONE, mustDays: [5, 1] }).mustDays).toEqual([1, 5]);
    expect(hasRoutine({ ...EMPTY_ROUTINE, mustDays: [2] })).toBe(true);
  });
});

describe("the own time window (Custom)", () => {
  it("accepts a window inside one day that fits a session", () => {
    expect(routineProblem({ ...NONE, sessionMinutes: 60, dayFrom: 390, dayUntil: 480 }, [])).toBeNull();
    expect(routineProblem({ ...NONE, dayFrom: 0, dayUntil: 1440 }, [])).toBeNull();
    expect(cleanRoutine({ ...NONE, dayFrom: 390, dayUntil: 480 })).toMatchObject({ dayFrom: 390, dayUntil: 480 });
    expect(hasRoutine({ ...EMPTY_ROUTINE, dayFrom: 390, dayUntil: 480 })).toBe(true);
  });

  it("refuses half windows, reversed ones, ones past the day and one with a part of the day", () => {
    for (const w of [{ dayFrom: 390 }, { dayUntil: 480 }, { dayFrom: 480, dayUntil: 390 }, { dayFrom: 60, dayUntil: 1441 }, { dayFrom: 6.5, dayUntil: 480 }, { dayPart: "morning", dayFrom: 390, dayUntil: 480 }]) {
      expect(routineProblem({ ...NONE, ...w }, [])?.error).toBe("day_window");
    }
  });

  it("refuses a window shorter than one session", () => {
    expect(routineProblem({ ...NONE, sessionMinutes: 120, dayFrom: 390, dayUntil: 480 }, [])).toEqual({ error: "day_window_short", message: "The time window is shorter than one session" });
  });
});
