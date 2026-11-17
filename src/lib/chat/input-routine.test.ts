// Spec 43 (R22 extended, R45): what Claude receives about a goal's routine. Only the allowed keys,
// never the place; a goal without a routine exactly as before.
import { describe, expect, it } from "vitest";
import type { GoalRoutine } from "@/lib/goals/routine";
import { buildAssistantInput, type AssistantInputSource, type GoalInput } from "./input";
import { chatTotals } from "./totals";

const NOW = new Date("2026-11-16T21:30:00Z"); // Monday evening in Lisbon
const PLAIN: GoalInput = { id: "7f1d5c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f", title: "Statistics exam", deadline: "2027-01-20", rules: [{ kind: "hours", target: 6, minMinutes: null }] };
const FULL: GoalRoutine = {
  category: "sport",
  categoryOther: null,
  sessionMinutes: 90,
  dayPart: "evening",
  avoidDays: [5, 7],
  mustDays: [],
  dayFrom: null,
  dayUntil: null,
  location: "Fitness Park, Rua Augusta 12, Porto",
};
const GYM: GoalInput = {
  id: "0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e",
  title: "Gym",
  deadline: null,
  rules: [{ kind: "count", target: 3, minMinutes: 45 }],
  routine: FULL,
  weeks: [
    { from: "2026-11-16", to: "2026-11-22", left: 2 },
    { from: "2026-11-23", to: "2026-11-29", left: 3 },
  ],
};

function source(goals: GoalInput[], change: Partial<AssistantInputSource> = {}): AssistantInputSource {
  return {
    now: NOW,
    timeZone: "Europe/Lisbon",
    dayStartHour: 7,
    dayEndHour: 22,
    history: [],
    goals,
    calendar: [{ allDay: false, title: "Lecture", startAt: new Date("2026-11-17T10:00:00Z"), endAt: new Date("2026-11-17T12:00:00Z"), mayOverlap: false }],
    totals: chatTotals({ doneEvents: [], sessions: [], goals: [] }, NOW, "Europe/Lisbon"),
    message: "Plan my week",
    ...change,
  };
}

/** The goal entry exactly as the builder made it before spec 43. */
const before = (g: GoalInput) => ({
  id: g.id,
  title: g.title,
  deadline: g.deadline,
  rules: g.rules.map((r) => ({ kind: r.kind, target: r.target, minMinutes: r.minMinutes })),
});

describe("a goal with a routine in the data block", () => {
  it("has exactly the allowed keys, and never the place", () => {
    const [gym] = buildAssistantInput(source([GYM])).goals;
    expect(gym).toEqual({
      id: GYM.id,
      title: "Gym",
      deadline: null,
      rules: [{ kind: "count", target: 3, minMinutes: 45 }],
      category: "sport",
      sessionMinutes: 90,
      dayPart: "evening",
      never: ["Friday", "Sunday"],
      neverDates: ["2026-11-20", "2026-11-22", "2026-11-27", "2026-11-29"],
      away: true,
      weeks: [
        { from: "2026-11-16", to: "2026-11-22", left: 2 },
        { from: "2026-11-23", to: "2026-11-29", left: 3 },
      ],
    });
    const allowed = ["id", "title", "deadline", "rules", "category", "categoryOther", "sessionMinutes", "dayPart", "window", "never", "neverDates", "always", "alwaysDates", "away", "weeks"];
    expect(Object.keys(gym).filter((key) => !allowed.includes(key))).toEqual([]);
    const text = JSON.stringify(buildAssistantInput(source([GYM])));
    for (const part of ["Fitness Park", "Rua Augusta", "Porto", "location"]) expect(text, part).not.toContain(part);
  });

  it("leaves out every key without a value; a place that is a web link is not 'away'", () => {
    const routine: GoalRoutine = { category: null, categoryOther: null, sessionMinutes: null, dayPart: null, avoidDays: [], mustDays: [], dayFrom: null, dayUntil: null, location: "https://zoom.us/j/123" };
    const [goal] = buildAssistantInput(source([{ ...GYM, routine, weeks: [] }])).goals;
    expect(goal).toEqual({ ...before(GYM), weeks: [] });
  });

  it("sends an own window as HH:MM, cut to the visible hours, and leaves it out when nothing is left", () => {
    const at = (dayFrom: number, dayUntil: number) => buildAssistantInput(source([{ ...GYM, routine: { ...FULL, dayPart: null, dayFrom, dayUntil } }])).goals[0];
    const hours = source([]);
    expect(at(hours.dayStartHour * 60 + 30, hours.dayStartHour * 60 + 90)).toMatchObject({ window: { from: `${String(hours.dayStartHour).padStart(2, "0")}:30` } });
    expect(at(0, hours.dayStartHour * 60 + 60)).toMatchObject({ window: { from: `${String(hours.dayStartHour).padStart(2, "0")}:00` } });
    expect(at(0, hours.dayStartHour * 60)).not.toHaveProperty("window");
    expect(buildAssistantInput(source([{ ...GYM, routine: FULL }])).goals[0]).not.toHaveProperty("window");
  });

  it("sends the days for sure by name and as dates, and leaves them out when there are none", () => {
    const routine: GoalRoutine = { ...FULL, mustDays: [1, 3] };
    const late = new Date("2026-11-15T23:30:00Z");
    const [goal] = buildAssistantInput(source([{ ...GYM, routine }], { now: late })).goals;
    expect(goal).toMatchObject({ always: ["Monday", "Wednesday"], alwaysDates: ["2026-11-16", "2026-11-18", "2026-11-23", "2026-11-25"] });
    const [plain] = buildAssistantInput(source([{ ...GYM, routine: FULL }])).goals;
    expect(plain).not.toHaveProperty("always");
    expect(plain).not.toHaveProperty("alwaysDates");
  });

  it("sends the own word only with the category 'other'", () => {
    const routine: GoalRoutine = { ...FULL, category: "other", categoryOther: "Music", location: null };
    const [goal] = buildAssistantInput(source([{ ...GYM, routine }])).goals;
    expect(goal).toMatchObject({ category: "other", categoryOther: "Music" });
    expect(goal).not.toHaveProperty("away");
  });

  it("the never dates are the 15 days from today to the last day for proposals, in the person's time zone", () => {
    const routine: GoalRoutine = { ...FULL, avoidDays: [1] };
    // 23:30 on Sunday 15 Nov in Lisbon is already Monday 16 Nov in Berlin.
    const late = new Date("2026-11-15T23:30:00Z");
    const lisbon = buildAssistantInput(source([{ ...GYM, routine }], { now: late }));
    expect(lisbon.today).toBe("2026-11-15");
    expect(lisbon.goals[0]).toMatchObject({ never: ["Monday"], neverDates: ["2026-11-16", "2026-11-23"] });
    const berlin = buildAssistantInput(source([{ ...GYM, routine }], { now: late, timeZone: "Europe/Berlin" }));
    expect(berlin.today).toBe("2026-11-16");
    expect(berlin.lastDayForProposals).toBe("2026-11-30");
    expect(berlin.goals[0]).toMatchObject({ neverDates: ["2026-11-16", "2026-11-23", "2026-11-30"] });
  });

  it("every never date is one of the named weekdays, across all 15 days", () => {
    const routine: GoalRoutine = { ...FULL, avoidDays: [2, 4, 6] };
    const input = buildAssistantInput(source([{ ...GYM, routine }]));
    const goal = input.goals[0] as { never: string[]; neverDates: string[] };
    expect(goal.never).toEqual(["Tuesday", "Thursday", "Saturday"]);
    const names = goal.neverDates.map((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }));
    expect(new Set(names)).toEqual(new Set(goal.never));
    expect(goal.neverDates).toEqual(["2026-11-17", "2026-11-19", "2026-11-21", "2026-11-24", "2026-11-26", "2026-11-28"]);
  });
});

describe("a goal without a routine", () => {
  it("is the same object as before spec 43, also next to a goal with one", () => {
    const goals = buildAssistantInput(source([PLAIN, GYM])).goals;
    expect(goals[0]).toEqual(before(PLAIN));
    expect(JSON.stringify(goals[0])).toBe(JSON.stringify(before(PLAIN)));
  });

  it("weeks given without a routine are not sent", () => {
    const [goal] = buildAssistantInput(source([{ ...PLAIN, weeks: GYM.weeks }])).goals;
    expect(JSON.stringify(goal)).toBe(JSON.stringify(before(PLAIN)));
  });

  it("with no routines at all, the whole block is byte for byte what it was", () => {
    const input = buildAssistantInput(source([PLAIN, { ...PLAIN, id: "a", title: "Run", deadline: null }]));
    const asBefore = { ...input, goals: [before(PLAIN), before({ ...PLAIN, id: "a", title: "Run", deadline: null })] };
    expect(JSON.stringify(input)).toBe(JSON.stringify(asBefore));
  });
});
