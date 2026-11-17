// Spec 43 (R45): the sessions left this week and next, worked out by our server.
import { describe, expect, it } from "vitest";
import { goalWeeks, type GoalEvent, type GoalWeeksInput, type WeekRule } from "./goal-weeks";

// Wednesday 18 November 2026, 09:00 in Lisbon (UTC in winter).
const NOW = new Date("2026-11-18T09:00:00Z");
const GOAL = "goal-gym";

const ev = (start: string, minutes: number, goalId: string | null = GOAL): GoalEvent => ({
  goalId,
  startAt: new Date(start),
  endAt: new Date(new Date(start).getTime() + minutes * 60000),
});

function weeks(rules: WeekRule[], extra: Partial<GoalWeeksInput> = {}, goal: Partial<GoalWeeksInput["goal"]> = {}) {
  return goalWeeks({
    goal: { id: GOAL, deadline: null, rules, sessionMinutes: null, ...goal },
    done: [],
    planned: [],
    now: NOW,
    timeZone: "Europe/Lisbon",
    ...extra,
  });
}

const count = (target: number, minMinutes: number | null = null): WeekRule => ({ kind: "count", target, minMinutes });
const hours = (target: number, minMinutes: number | null = null): WeekRule => ({ kind: "hours", target, minMinutes });

describe("goalWeeks", () => {
  it("lists the current week and the next, Monday to Sunday, with the whole target left when nothing is there", () => {
    expect(weeks([count(3)])).toEqual([
      { from: "2026-11-16", to: "2026-11-22", left: 3 },
      { from: "2026-11-23", to: "2026-11-29", left: 3 },
    ]);
  });

  it("count: takes off the done events and the ones still planned from today on", () => {
    const done = [ev("2026-11-16T18:00:00Z", 60)];
    const planned = [ev("2026-11-19T18:00:00Z", 60), ev("2026-11-24T07:00:00Z", 60)];
    expect(weeks([count(3)], { done, planned }).map((w) => w.left)).toEqual([1, 2]);
  });

  it("count: a planned event before today (missed, not done) does not count; one earlier today does", () => {
    const planned = [ev("2026-11-17T18:00:00Z", 60), ev("2026-11-18T07:00:00Z", 60)];
    expect(weeks([count(3)], { planned })[0].left).toBe(2);
  });

  it("only this goal's events count, not another goal's or events without a goal", () => {
    const planned = [ev("2026-11-19T18:00:00Z", 60, "other"), ev("2026-11-20T18:00:00Z", 60, null)];
    const done = [ev("2026-11-16T18:00:00Z", 60, "other")];
    expect(weeks([count(2)], { planned, done })[0].left).toBe(2);
  });

  it("count with min_minutes: only events at least that long count (R8)", () => {
    const done = [ev("2026-11-16T18:00:00Z", 30)];
    const planned = [ev("2026-11-19T18:00:00Z", 45), ev("2026-11-20T18:00:00Z", 44)];
    expect(weeks([count(3, 45)], { done, planned })[0].left).toBe(2);
  });

  it("hours: the minutes left divided by the session length, rounded up", () => {
    const done = [ev("2026-11-16T18:00:00Z", 90)];
    const planned = [ev("2026-11-19T18:00:00Z", 30)];
    // 5 h = 300 min − 90 − 30 = 180 min; sessions of 75 min: 2.4 → 3.
    expect(weeks([hours(5)], { done, planned }, { sessionMinutes: 75 })[0].left).toBe(3);
  });

  it("hours without a session length: sessions of 60 minutes", () => {
    const done = [ev("2026-11-16T18:00:00Z", 30)];
    expect(weeks([hours(2)], { done })[0].left).toBe(2);
  });

  it("never below 0", () => {
    const done = [ev("2026-11-16T18:00:00Z", 60), ev("2026-11-17T18:00:00Z", 60), ev("2026-11-17T20:00:00Z", 60)];
    expect(weeks([count(2)], { done })[0].left).toBe(0);
    expect(weeks([hours(1)], { done })[0].left).toBe(0);
  });

  it("several rules: the largest of their values", () => {
    const done = [ev("2026-11-16T18:00:00Z", 30), ev("2026-11-17T18:00:00Z", 30)];
    // count 3 → 1 left; hours 3 → 120 min left / 60 → 2 left.
    expect(weeks([count(3), hours(3)], { done })[0].left).toBe(2);
    expect(weeks([count(5), hours(1)], { done })[0].left).toBe(3);
  });

  it("the week of an event is decided in the person's time zone", () => {
    // Monday 23 Nov 00:30 in Berlin is Sunday 22 Nov 23:30 in UTC: next week in Berlin.
    const planned = [ev("2026-11-22T23:30:00Z", 60)];
    expect(weeks([count(2)], { planned, timeZone: "Europe/Berlin" }).map((w) => w.left)).toEqual([2, 1]);
    expect(weeks([count(2)], { planned, timeZone: "UTC" }).map((w) => w.left)).toEqual([1, 2]);
  });

  it("across a daylight-saving change: the week ends at Sunday midnight local time", () => {
    // Clocks in Berlin go back on Sunday 25 Oct 2026 at 03:00. Wednesday 21 Oct.
    const now = new Date("2026-10-21T08:00:00Z");
    const sundayLate = ev("2026-10-25T22:30:00Z", 60); // Sun 25 Oct 23:30 in Berlin (UTC+1 after the change)
    const mondayEarly = ev("2026-10-25T23:30:00Z", 60); // Mon 26 Oct 00:30 in Berlin
    expect(weeks([count(3)], { now, planned: [sundayLate, mondayEarly], timeZone: "Europe/Berlin" })).toEqual([
      { from: "2026-10-19", to: "2026-10-25", left: 2 },
      { from: "2026-10-26", to: "2026-11-01", left: 2 },
    ]);
  });

  it("a week that starts after the deadline is not listed; the deadline's own week is", () => {
    expect(weeks([count(2)], {}, { deadline: "2026-11-22" })).toEqual([{ from: "2026-11-16", to: "2026-11-22", left: 2 }]);
    expect(weeks([count(2)], {}, { deadline: "2026-11-23" })).toHaveLength(2);
  });

  it("a goal without an end date lists both weeks", () => {
    expect(weeks([count(1)], {}, { deadline: null })).toHaveLength(2);
  });
});
