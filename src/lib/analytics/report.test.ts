// Tests for the numbers of the Analytics page (spec 49), with fixed dates. The week shown is
// Monday 16 to Sunday 22 November 2026; "now" is Wednesday 18 November, 12:00 UTC, unless a test says otherwise.
import { describe, expect, it } from "vitest";
import {
  blockedNumbers,
  blockOfHour,
  buildReport,
  focusNumbers,
  goalsNumbers,
  heatLevel,
  notMetWeeks,
  streakNumbers,
  timeNumbers,
  type ReportEvent,
  type ReportGoal,
  type ReportInput,
  type ReportSession,
} from "./report";

const NOW = new Date("2026-11-18T12:00:00Z");
const MONDAY = "2026-11-16";

/** A finished session that starts at `start` (ISO) and ran `minutes` of its `planned` minutes. */
function session(start: string, minutes = 30, planned = 30, extra: Partial<ReportSession> = {}): ReportSession {
  const startedAt = new Date(start);
  return { startedAt, endedAt: new Date(startedAt.getTime() + minutes * 60_000), plannedMinutes: planned, focusedMinutes: minutes, goalId: null, goalTitle: null, ...extra };
}

function event(id: string, start: string, minutes: number, status: "planned" | "done", goalId: string | null = null): ReportEvent {
  const startAt = new Date(start);
  return { id, title: `Event ${id}`, goalId, startAt, endAt: new Date(startAt.getTime() + minutes * 60_000), status };
}

function goal(id: string, extra: Partial<ReportGoal> = {}): ReportGoal {
  return {
    id,
    title: `Goal ${id}`,
    color: "teal",
    icon: "rocket",
    deadline: "2027-03-14",
    createdAt: new Date("2026-09-01T10:00:00Z"),
    rules: [{ id: `${id}-r`, kind: "count", target: 2, minMinutes: null }],
    ...extra,
  };
}

/** A moment after the shown week, so "last week" is the whole week before (issue #126). */
const AFTER_WEEK = new Date("2026-11-30T12:00:00Z");

function input(over: Partial<ReportInput> = {}): ReportInput {
  return { sessions: [], attempts: [], events: [], goals: [], now: NOW, monday: MONDAY, timeZone: "Europe/Lisbon", ...over };
}

describe("focus numbers", () => {
  it("an empty week gives zeros, no score and nothing 'best'", () => {
    const f = focusNumbers(input());
    expect(f.week).toEqual({ focusedMinutes: 0, sessions: 0, score: null, attempts: 0 });
    expect(f.lastWeek).toEqual({ focusedMinutes: 0, sessions: 0, score: null, attempts: 0 });
    expect(f.days).toHaveLength(7);
    expect(f.weeks).toHaveLength(8);
    expect(f.weeks[7].monday).toBe(MONDAY);
    expect(f.weeks[0].monday).toBe("2026-09-28");
    expect([f.averageMinutes, f.finishedAsPlanned, f.activeDays, f.bestBlock, f.longest, f.bestScore, f.bestDay]).toEqual([0, 0, 0, null, null, null, null]);
    expect(f.weekdays).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(f.heat).toHaveLength(84);
    expect(f.hours.every((h) => h.sessions === 0 && h.score === null)).toBe(true);
  });

  it("an empty week before: the last week stays empty while this week has numbers", () => {
    const f = focusNumbers(input({ sessions: [session("2026-11-17T09:00:00Z", 45, 60)] }));
    expect(f.week).toEqual({ focusedMinutes: 45, sessions: 1, score: 75, attempts: 0 });
    expect(f.lastWeek).toEqual({ focusedMinutes: 0, sessions: 0, score: null, attempts: 0 });
    expect(f.averageMinutes).toBe(6); // 45 / 8 = 5.6
  });

  it("the best of the week: longest, best score, best day (the earliest wins a tie)", () => {
    const f = focusNumbers(
      input({
        sessions: [
          session("2026-11-16T09:00:00Z", 60, 60, { goalTitle: "Thesis", goalId: "g" }),
          session("2026-11-17T09:00:00Z", 60, 60),
          session("2026-11-17T11:00:00Z", 20, 60),
        ],
      }),
    );
    expect(f.longest).toEqual({ minutes: 60, date: "2026-11-16", goal: "Thesis" });
    expect(f.bestScore).toEqual({ score: 100, date: "2026-11-16" });
    expect(f.bestDay).toEqual({ date: "2026-11-17", minutes: 80, sessions: 2 });
    expect(f.activeDays).toBe(2);
    expect(f.finishedAsPlanned).toBe(2);
  });

  it("a score is lowered by blocked visits during the session (R19)", () => {
    const f = focusNumbers(input({ sessions: [session("2026-11-16T09:00:00Z", 30, 30)], attempts: [{ domain: "x.com", attemptedAt: new Date("2026-11-16T09:10:00Z") }] }));
    expect(f.week.score).toBe(95);
  });

  it("a session exactly at local midnight and at the week borders", () => {
    // Lisbon is on UTC in November: Monday 00:00 starts the week, Sunday 23:59 ends it.
    const f = focusNumbers(
      input({
        now: AFTER_WEEK, // the week is over: the whole last week counts
        sessions: [
          session("2026-11-15T23:59:00Z", 10, 10), // Sunday before: last week
          session("2026-11-16T00:00:00Z", 10, 10), // Monday 00:00: this week, "before 9"
          session("2026-11-22T23:59:00Z", 10, 10), // Sunday 23:59: this week
          session("2026-11-23T00:00:00Z", 10, 10), // next Monday: not this week
        ],
      }),
    );
    expect(f.week.sessions).toBe(2);
    expect(f.lastWeek.sessions).toBe(1);
    expect(f.days[0].sessions).toBe(1);
    expect(f.days[6].sessions).toBe(1);
    expect(f.hours.map((h) => h.sessions)).toEqual([1, 0, 0, 0, 2]); // 00:00 is before 9; both 23:59 are after 4 pm; next week is out
  });

  it("works in America/New_York: the week borders move with the time zone", () => {
    // New York is UTC-5 in November: Monday 00:00 there is 05:00 UTC.
    const f = focusNumbers(
      input({
        now: AFTER_WEEK, // the week is over: the whole last week counts
        timeZone: "America/New_York",
        sessions: [
          session("2026-11-16T04:59:00Z", 10, 10), // Sunday 23:59 in New York: last week
          session("2026-11-16T05:00:00Z", 10, 10), // Monday 00:00 in New York: this week, before 9
          session("2026-11-16T14:00:00Z", 10, 10), // 09:00 in New York: the 9 to 11 block
          session("2026-11-23T04:59:00Z", 10, 10), // Sunday 23:59 in New York: this week
          session("2026-11-23T05:00:00Z", 10, 10), // next week
        ],
      }),
    );
    expect(f.lastWeek.sessions).toBe(1);
    expect(f.week.sessions).toBe(3);
    expect(f.days.map((d) => d.sessions)).toEqual([2, 0, 0, 0, 0, 0, 1]);
    expect(f.hours.map((h) => h.sessions)).toEqual([1, 1, 0, 0, 2]);
  });

  it("the best hours need 2 sessions in a block", () => {
    const one = focusNumbers(input({ sessions: [session("2026-11-16T09:00:00Z"), session("2026-11-17T15:00:00Z")] }));
    expect(one.bestBlock).toBeNull();
    const two = focusNumbers(
      input({ sessions: [session("2026-11-16T09:00:00Z", 30, 30), session("2026-11-17T10:30:00Z", 30, 30), session("2026-11-17T15:00:00Z", 15, 30), session("2026-11-18T15:00:00Z", 15, 30)] }),
    );
    expect(two.hours.find((h) => h.block === "morning")).toEqual({ block: "morning", sessions: 2, score: 100 });
    expect(two.hours.find((h) => h.block === "afternoon")).toEqual({ block: "afternoon", sessions: 2, score: 50 });
    expect(two.bestBlock).toBe("morning");
  });

  it("the blocks split at 9, 11, 14 and 16 o'clock", () => {
    expect([8, 9, 10, 11, 13, 14, 15, 16, 23, 0].map(blockOfHour)).toEqual(["early", "morning", "morning", "midday", "midday", "afternoon", "afternoon", "late", "late", "early"]);
  });

  it("counts the weekdays of the 4 weeks ending with the shown week, and the 8 weeks for the averages", () => {
    const f = focusNumbers(
      input({
        sessions: [
          session("2026-11-16T09:00:00Z", 60, 60), // Monday
          session("2026-11-02T09:00:00Z", 30, 30), // Monday, 2 weeks before
          session("2026-10-20T09:00:00Z", 30, 30), // Tuesday, 4 weeks before: outside the 4 weeks
          session("2026-10-31T09:00:00Z", 30, 30), // Saturday, 2.5 weeks before: inside
        ],
      }),
    );
    expect(f.weekdays).toEqual([2, 0, 0, 0, 0, 1, 0]);
    expect(f.weekdaySessions).toBe(3);
    expect(f.averageMinutes).toBe(Math.round(150 / 8));
  });

  it("the heat levels are 0, under 60, under 120 and 120 and more", () => {
    expect([0, 1, 59, 60, 119, 120, 500].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    const f = focusNumbers(
      input({
        sessions: [
          session("2026-11-16T09:00:00Z", 59, 60),
          session("2026-11-17T09:00:00Z", 60, 60),
          session("2026-11-18T09:00:00Z", 119, 120),
          session("2026-11-19T09:00:00Z", 60, 60),
          session("2026-11-19T11:00:00Z", 60, 60), // 120 on the day
        ],
      }),
    );
    expect(f.heat.slice(-7, -3).map((d) => [d.date, d.minutes, d.level])).toEqual([
      ["2026-11-16", 59, 1],
      ["2026-11-17", 60, 2],
      ["2026-11-18", 119, 2],
      ["2026-11-19", 120, 3],
    ]);
    expect(f.heat[83].date).toBe("2026-11-22");
    expect(f.heat[0].date).toBe("2026-08-31");
  });
});

describe("blocked numbers", () => {
  const attempt = (domain: string, at: string) => ({ domain, attemptedAt: new Date(at) });

  it("an empty week", () => {
    expect(blockedNumbers(input())).toEqual({
      week: 0,
      lastWeek: 0,
      perSession: null,
      sessionsClean: [],
      cleanSessions: 0,
      hours: HOURS_ZERO,
      worstBlock: null,
      topSites: [],
    });
  });

  it("counts visits, clean sessions, parts of the day and the top sites", () => {
    const b = blockedNumbers(
      input({
        sessions: [session("2026-11-16T09:00:00Z", 30, 30), session("2026-11-17T09:00:00Z", 30, 30), session("2026-11-18T15:00:00Z", 30, 30)],
        attempts: [
          attempt("x.com", "2026-11-16T09:05:00Z"), // inside the first session
          attempt("x.com", "2026-11-16T09:10:00Z"),
          attempt("reddit.com", "2026-11-16T20:00:00Z"), // outside any session
          attempt("x.com", "2026-11-09T09:00:00Z"), // last week
        ],
      }),
    );
    expect(b.week).toBe(3);
    expect(b.lastWeek).toBe(1);
    expect(b.sessionsClean).toEqual([false, true, true]);
    expect(b.cleanSessions).toBe(2);
    expect(b.perSession).toBe(0.7); // 2 visits during 3 sessions
    expect(b.hours.map((h) => h.count)).toEqual([0, 2, 0, 0, 1]);
    expect(b.worstBlock).toBe("morning");
    expect(b.topSites).toEqual([
      { domain: "x.com", count: 2 },
      { domain: "reddit.com", count: 1 },
    ]);
  });

  it("a visit just after midnight belongs to the next day's week", () => {
    const b = blockedNumbers(input({ attempts: [attempt("x.com", "2026-11-22T23:59:59Z"), attempt("x.com", "2026-11-23T00:00:00Z")] }));
    expect(b.week).toBe(1);
  });
});

const HOURS_ZERO = [
  { block: "early", count: 0 },
  { block: "morning", count: 0 },
  { block: "midday", count: 0 },
  { block: "afternoon", count: 0 },
  { block: "late", count: 0 },
];

describe("goals numbers", () => {
  it("an empty week with a goal: open, nothing done, days left counted from today", () => {
    const g = goalsNumbers(input({ goals: [goal("a", { deadline: "2026-11-25" })] }));
    expect(g.list).toHaveLength(1);
    expect(g.list[0]).toMatchObject({ status: "open", weeksInRow: 0, deadline: "2026-11-25", daysLeft: 7 });
    expect(g.list[0].rules).toEqual([{ unit: "sessions", done: 0, target: 2, status: "open" }]);
    expect([g.reached, g.judged, g.planTotal, g.planDone, g.slipped]).toEqual([0, 1, 0, 0, []]);
    expect(g.plan).toHaveLength(7);
  });

  it("a goal without rules is not judged", () => {
    const g = goalsNumbers(input({ goals: [goal("a", { rules: [] }), goal("b")] }));
    expect(g.list.map((x) => x.goal.id)).toEqual(["b"]);
    expect(g.judged).toBe(1);
  });

  it("a goal met this week, with weeks in a row, and the count of 4 weeks", () => {
    const events = [
      event("1", "2026-11-16T09:00:00Z", 60, "done", "a"),
      event("2", "2026-11-17T09:00:00Z", 60, "done", "a"),
      event("3", "2026-11-09T09:00:00Z", 60, "done", "a"),
      event("4", "2026-11-10T09:00:00Z", 60, "done", "a"),
      event("5", "2026-11-02T09:00:00Z", 60, "done", "a"), // only 1 that week: missed
    ];
    const g = goalsNumbers(input({ events, goals: [goal("a")] }));
    expect(g.list[0].status).toBe("met");
    expect(g.list[0].weeksInRow).toBe(2);
    expect(g.reached).toBe(1);
    expect(g.lastWeeks.map((w) => [w.monday, w.reached, w.judged])).toEqual([
      ["2026-10-26", 0, 1],
      ["2026-11-02", 0, 1],
      ["2026-11-09", 1, 1],
      ["2026-11-16", 1, 1],
    ]);
  });

  it("an open week (still running) neither counts nor breaks the row", () => {
    const events = [event("1", "2026-11-09T09:00:00Z", 60, "done", "a"), event("2", "2026-11-10T09:00:00Z", 60, "done", "a"), event("3", "2026-11-16T09:00:00Z", 60, "done", "a")];
    const g = goalsNumbers(input({ events, goals: [goal("a")] }));
    expect(g.list[0].status).toBe("open"); // 1 of 2, the week is not over
    expect(g.list[0].weeksInRow).toBe(1);
  });

  it("a week that ended unmet is missed; the creation week is never missed", () => {
    const missed = goalsNumbers(input({ now: new Date("2026-11-25T12:00:00Z"), goals: [goal("a")] }));
    expect(missed.list[0].status).toBe("missed");
    const created = goalsNumbers(input({ now: new Date("2026-11-25T12:00:00Z"), goals: [goal("a", { createdAt: new Date("2026-11-18T08:00:00Z") })] }));
    expect(created.list[0].status).toBe("open");
  });

  it("an hours rule shows hours rounded down to a tenth", () => {
    const g = goalsNumbers(
      input({
        goals: [goal("a", { rules: [{ id: "r", kind: "hours", target: 6, minMinutes: null }] })],
        events: [event("1", "2026-11-16T09:00:00Z", 100, "done", "a"), event("2", "2026-11-17T09:00:00Z", 100, "planned", "a")],
      }),
    );
    expect(g.list[0].rules[0]).toEqual({ unit: "hours", done: 1.6, target: 6, status: "open" });
  });

  it("weeks after the deadline's week are not judged; a goal not created yet is left out", () => {
    const afterDeadline = goalsNumbers(input({ goals: [goal("a", { deadline: "2026-11-08" })] }));
    expect(afterDeadline.list).toEqual([]);
    expect(afterDeadline.judged).toBe(0);
    const notYet = goalsNumbers(input({ goals: [goal("a", { createdAt: new Date("2026-11-25T08:00:00Z") })] }));
    expect(notYet.list).toEqual([]);
    // The week of the deadline is the last one judged; later weeks are left out.
    const onDeadline = goalsNumbers(input({ goals: [goal("a", { deadline: "2026-11-22" })] }));
    expect(onDeadline.list).toHaveLength(1);
  });

  it("weeks past the deadline neither count nor break a row", () => {
    // Deadline in the week of 9 Nov; the shown week of 9 Nov was met, 2 Nov was met: row of 2.
    const events = [
      event("1", "2026-11-02T09:00:00Z", 60, "done", "a"),
      event("2", "2026-11-03T09:00:00Z", 60, "done", "a"),
      event("3", "2026-11-09T09:00:00Z", 60, "done", "a"),
      event("4", "2026-11-10T09:00:00Z", 60, "done", "a"),
    ];
    const g = goalsNumbers(input({ goals: [goal("a", { deadline: "2026-11-15" })], monday: "2026-11-09", now: new Date("2026-11-25T12:00:00Z"), events }));
    expect(g.list[0]).toMatchObject({ status: "met", weeksInRow: 2 });
    // Counting back from a later week skips the weeks after the deadline.
    const later = notMetWeeks(input({ goals: [goal("a", { deadline: "2026-11-15" })], monday: "2026-11-23", now: new Date("2026-11-25T12:00:00Z"), events }));
    expect(later).toEqual({ a: 0 });
  });

  it("a goal without an end date shows 'null' deadline and days left", () => {
    const g = goalsNumbers(input({ goals: [goal("a", { deadline: null })] }));
    expect(g.list[0]).toMatchObject({ deadline: null, daysLeft: null });
  });

  it("days left count from today also when an earlier week is shown", () => {
    const g = goalsNumbers(input({ monday: "2026-11-02", goals: [goal("a", { deadline: "2026-11-30" })] }));
    expect(g.list[0].daysLeft).toBe(12);
  });

  it("a plan day by day: done, not done (over) and planned (still ahead); slipped earliest first, at most 5", () => {
    const events = [
      event("done", "2026-11-16T09:00:00Z", 60, "done", "a"),
      event("over", "2026-11-17T09:00:00Z", 30, "planned", "a"),
      event("ahead", "2026-11-19T09:00:00Z", 60, "planned", "a"),
      event("nogoal", "2026-11-17T10:00:00Z", 60, "planned"), // no goal: not in the plan
      event("deleted", "2026-11-17T11:00:00Z", 60, "planned", "gone"), // goal deleted: not in the plan
      event("over2", "2026-11-18T08:00:00Z", 60, "planned", "a"), // ends 09:00, before now (12:00)
    ];
    const g = goalsNumbers(input({ events, goals: [goal("a")] }));
    expect(g.plan[0].items.map((i) => [i.eventId, i.state])).toEqual([["done", "done"]]);
    expect(g.plan[1].items.map((i) => [i.eventId, i.state])).toEqual([["over", "not_done"]]);
    expect(g.plan[3].items.map((i) => [i.eventId, i.state])).toEqual([["ahead", "planned"]]);
    expect([g.planTotal, g.planDone]).toEqual([4, 1]);
    expect(g.slipped.map((s) => [s.eventId, s.minutes])).toEqual([
      ["over", 30],
      ["over2", 60],
    ]);
    const many = Array.from({ length: 7 }, (_, i) => event(`m${i}`, `2026-11-16T0${i + 1}:00:00Z`, 10, "planned", "a"));
    expect(goalsNumbers(input({ events: many, goals: [goal("a")] })).slipped).toHaveLength(5);
  });

  it("an event on a Sunday night belongs to the day it starts in a time zone that is not UTC", () => {
    const g = goalsNumbers(input({ timeZone: "America/New_York", events: [event("x", "2026-11-23T03:00:00Z", 30, "planned", "a")], goals: [goal("a")] })); // Sunday 22:00 in New York
    expect(g.plan[6].items).toHaveLength(1);
  });

  it("weeks not met in a row", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const result = notMetWeeks(input({ now, goals: [goal("a"), goal("b", { rules: [] })], events: [event("1", "2026-11-03T09:00:00Z", 60, "done", "a"), event("2", "2026-11-04T09:00:00Z", 60, "done", "a")] }));
    // Shown week 16 Nov missed, 9 Nov missed, 2 Nov met.
    expect(result).toEqual({ a: 2 });
  });
});

describe("time numbers", () => {
  it("an empty week: no busiest day, no plan kept", () => {
    const t = timeNumbers(input());
    expect([t.doneMinutes, t.goalMinutes, t.busiest, t.quietest, t.endedMinutes, t.planKept, t.planKeptLastWeek, t.areas]).toEqual([0, 0, null, null, 0, null, null, []]);
    expect(t.days).toHaveLength(7);
  });

  it("adds done minutes per day and goal; a deleted goal and no goal are 'No goal'", () => {
    const events = [
      event("1", "2026-11-16T09:00:00Z", 60, "done", "a"),
      event("2", "2026-11-16T11:00:00Z", 30, "done"),
      event("3", "2026-11-17T09:00:00Z", 45, "done", "gone"),
      event("4", "2026-11-17T12:00:00Z", 60, "planned", "a"), // not done: not counted
      event("5", "2026-11-09T09:00:00Z", 20, "done", "a"), // last week
    ];
    const t = timeNumbers(input({ events, goals: [goal("a")] }));
    expect(t.days[0]).toEqual({
      date: "2026-11-16",
      minutes: 90,
      parts: [
        { goalId: "a", minutes: 60 },
        { goalId: null, minutes: 30 },
      ],
    });
    expect(t.days[1].parts).toEqual([{ goalId: null, minutes: 45 }]);
    expect([t.doneMinutes, t.goalMinutes, t.lastWeekDoneMinutes]).toEqual([135, 60, 20]);
    expect(t.areas.map((a) => [a.goal?.id ?? null, a.minutes, a.lastWeekMinutes])).toEqual([
      [null, 75, 0],
      ["a", 60, 20],
    ]);
    expect(t.busiest).toEqual({ date: "2026-11-16", minutes: 90, events: 2 });
    expect(t.quietest).toEqual({ date: "2026-11-18", minutes: 0 });
  });

  it("an area that only had minutes last week still shows, with 0 this week", () => {
    const t = timeNumbers(input({ events: [event("5", "2026-11-09T09:00:00Z", 20, "done", "a")], goals: [goal("a")] }));
    expect(t.areas).toEqual([{ goal: { id: "a", title: "Goal a", color: "teal", icon: "rocket" }, minutes: 0, lastWeekMinutes: 20 }]);
  });

  it("plan kept: done minutes against all minutes that have ended; '–' (null) when none ended", () => {
    const events = [
      event("1", "2026-11-16T09:00:00Z", 60, "done"),
      event("2", "2026-11-17T09:00:00Z", 60, "planned"), // over, not done
      event("3", "2026-11-17T09:00:00Z", 60, "done"),
      event("4", "2026-11-19T09:00:00Z", 600, "planned"), // still ahead: not counted
    ];
    const t = timeNumbers(input({ events }));
    expect(t.endedMinutes).toBe(180);
    expect(t.planKept).toBe(67);
    const ahead = timeNumbers(input({ events: [event("4", "2026-11-19T09:00:00Z", 60, "planned")] }));
    expect([ahead.endedMinutes, ahead.planKept]).toEqual([0, null]);
  });
});

describe("streak", () => {
  const days = (...dates: string[]) => dates.map((d) => session(`${d}T09:00:00Z`));

  it("is 0 and 0 without anything", () => {
    expect(streakNumbers(input())).toEqual({ current: 0, record: 0 });
  });

  it("ending today", () => {
    expect(streakNumbers(input({ sessions: days("2026-11-16", "2026-11-17", "2026-11-18") }))).toEqual({ current: 3, record: 3 });
  });

  it("ending yesterday while today has nothing yet", () => {
    expect(streakNumbers(input({ sessions: days("2026-11-16", "2026-11-17") }))).toEqual({ current: 2, record: 2 });
  });

  it("is 0 when yesterday and today have nothing, but the record stays", () => {
    expect(streakNumbers(input({ sessions: days("2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13") }))).toEqual({ current: 0, record: 4 });
  });

  it("a done event of a goal counts, one without a goal (or of a deleted goal) does not", () => {
    const events = [event("1", "2026-11-17T09:00:00Z", 30, "done", "a"), event("2", "2026-11-18T09:00:00Z", 30, "done"), event("3", "2026-11-18T10:00:00Z", 30, "done", "gone"), event("4", "2026-11-16T09:00:00Z", 30, "planned", "a")];
    expect(streakNumbers(input({ events, goals: [goal("a")] }))).toEqual({ current: 1, record: 1 });
  });

  it("an earlier week ends on its Sunday", () => {
    const sessions = days("2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09");
    expect(streakNumbers(input({ monday: "2026-11-02", sessions }))).toEqual({ current: 3, record: 3 }); // Monday 9 lies after Sunday 8: not counted
    expect(streakNumbers(input({ monday: "2026-11-02", sessions: days("2026-11-06", "2026-11-07") }))).toEqual({ current: 0, record: 2 }); // Sunday itself is empty
    expect(streakNumbers(input({ monday: "2026-11-02", sessions: days("2026-11-07", "2026-11-08") }))).toEqual({ current: 2, record: 2 });
  });

  it("is limited to the 84 days", () => {
    const sessions = Array.from({ length: 100 }, (_, i) => session(`${new Date(Date.UTC(2026, 10, 18 - i)).toISOString().slice(0, 10)}T09:00:00Z`));
    expect(streakNumbers(input({ sessions }))).toEqual({ current: 80, record: 80 }); // the 84 days run from 31 Aug to Sunday 22 Nov; today is the 18th
  });

  it("a day at local midnight counts for that day in New York", () => {
    // 05:00 UTC on 17 Nov is 00:00 on the 17th in New York; 04:59 UTC would be the 16th.
    const sessions = [session("2026-11-17T05:00:00Z"), session("2026-11-18T05:00:00Z")];
    expect(streakNumbers(input({ timeZone: "America/New_York", sessions }))).toEqual({ current: 2, record: 2 });
  });
});

describe("buildReport", () => {
  it("fills the week's dates for the current week", () => {
    const r = buildReport(input());
    expect([r.timeZone, r.monday, r.previous, r.next, r.thisWeek, r.today, r.isCurrentWeek]).toEqual(["Europe/Lisbon", MONDAY, "2026-11-09", "2026-11-23", MONDAY, "2026-11-18", true]);
  });

  it("an earlier week has no today and is over", () => {
    const r = buildReport(input({ monday: "2026-11-09" }));
    expect([r.today, r.isCurrentWeek, r.thisWeek]).toEqual([null, false, MONDAY]);
  });

  it("a later week is not over yet", () => {
    expect(buildReport(input({ monday: "2026-11-23" })).isCurrentWeek).toBe(true);
  });
});

describe("last week while the week is still running (issue #126)", () => {
  // Wednesday 18 November 2026, 12:00 in Lisbon (UTC in November).
  const WEDNESDAY_NOON = new Date("2026-11-18T12:00:00Z");
  const sessions = [
    session("2026-11-09T09:00:00Z", 60, 60), // last Monday: counts
    session("2026-11-11T11:00:00Z", 60, 60), // last Wednesday 11:00, before the same moment: counts
    session("2026-11-11T13:00:00Z", 60, 60), // last Wednesday 13:00, after it: not yet
    session("2026-11-14T09:00:00Z", 60, 60), // last Saturday: not yet
    session("2026-11-16T09:00:00Z", 60, 60), // this Monday
  ];

  it("counts last week only up to the same moment, so Wednesday is not compared with a whole week", () => {
    const f = focusNumbers(input({ now: WEDNESDAY_NOON, sessions }));
    expect(f.week.sessions).toBe(1);
    expect(f.lastWeek.sessions).toBe(2);
    expect(f.lastWeek.focusedMinutes).toBe(120);
  });

  it("counts the whole last week once the shown week is over", () => {
    const f = focusNumbers(input({ now: AFTER_WEEK, sessions }));
    expect(f.lastWeek.sessions).toBe(4);
  });

  it("cuts blocked visits and done time of last week at the same moment", () => {
    const attempts = [
      { domain: "a.com", attemptedAt: new Date("2026-11-10T10:00:00Z") }, // counts
      { domain: "a.com", attemptedAt: new Date("2026-11-13T10:00:00Z") }, // not yet
    ];
    expect(blockedNumbers(input({ now: WEDNESDAY_NOON, attempts })).lastWeek).toBe(1);
    expect(blockedNumbers(input({ now: AFTER_WEEK, attempts })).lastWeek).toBe(2);
    const events = [event("e1", "2026-11-10T10:00:00Z", 60, "done"), event("e2", "2026-11-13T10:00:00Z", 30, "done")];
    expect(timeNumbers(input({ now: WEDNESDAY_NOON, events })).lastWeekDoneMinutes).toBe(60);
    expect(timeNumbers(input({ now: AFTER_WEEK, events })).lastWeekDoneMinutes).toBe(90);
  });
});
