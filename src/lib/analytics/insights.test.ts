// Tests for the sentences of the Analytics page (spec 49): every rule once where it speaks and once
// where it stays silent. The numbers are made up by hand, starting from a quiet week in which no rule speaks.
import { describe, expect, it } from "vitest";
import { insightsOf } from "./insights";
import { buildReport, type ReportParts } from "./report";
import type { GoalNumbers, Topic } from "./report-types";

type Patch<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object | null ? Patch<NonNullable<T[K]>> | null : T[K] };

function merge<T>(base: T, patch: Patch<T> | undefined): T {
  if (patch === undefined) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const old = out[key];
    out[key] = value !== null && typeof value === "object" && !Array.isArray(value) && old !== null && typeof old === "object" && !Array.isArray(old) ? merge(old, value as never) : value;
  }
  return out as T;
}

const NOW = new Date("2026-11-18T12:00:00Z");
const empty = buildReport({ sessions: [], attempts: [], events: [], goals: [], now: NOW, monday: "2026-11-16", timeZone: "Europe/Lisbon" });
const week = (minutes: number, sessions = 4, attempts = 0) => ({ focusedMinutes: minutes, sessions, score: 80, attempts });
const ZERO_HOURS = [
  { block: "early" as const, count: 0 },
  { block: "morning" as const, count: 0 },
  { block: "midday" as const, count: 0 },
  { block: "afternoon" as const, count: 0 },
  { block: "late" as const, count: 0 },
];

/** A week with activity in which no rule speaks. */
const BASE: ReportParts = merge(empty, {
  focus: {
    week: week(120),
    lastWeek: week(0, 0),
    weeks: ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"].map((monday) => ({ monday, ...week(120) })),
    days: empty.focus.days.map((d, i) => ({ ...d, focusedMinutes: i < 2 ? 60 : 0, sessions: i < 2 ? 2 : 0 })),
    bestDay: { date: "2026-11-16", minutes: 60, sessions: 2 },
    activeDays: 2,
    finishedAsPlanned: 4,
    weekdays: [1, 1, 1, 1, 1, 1, 1],
    weekdaySessions: 7,
  },
  time: { doneMinutes: 100, goalMinutes: 50, endedMinutes: 100, planKept: 70, planKeptLastWeek: null },
  streaks: { current: 1, record: 3 },
  blocked: { week: 2, lastWeek: 2, cleanSessions: 1, sessionsClean: [true, false, false, false], worstBlock: "morning", hours: ZERO_HOURS.map((h) => (h.block === "morning" ? { ...h, count: 1 } : h)), topSites: [{ domain: "a.com", count: 1 }, { domain: "b.com", count: 1 }] },
} as Patch<ReportParts>);
const BASE_LAST = { ...BASE.focus.lastWeek, sessions: 2 };

const make = (patch: Patch<ReportParts>): ReportParts => merge(BASE, patch);
const said = (r: ReportParts, topic: Topic, extras = {}) => insightsOf(r, extras).insights[topic];

function goalNumbers(id: string, over: Partial<GoalNumbers> = {}): GoalNumbers {
  return {
    goal: { id, title: `Goal ${id}`, color: "teal", icon: "rocket" },
    rules: [{ unit: "sessions", done: 1, target: 2, status: "open" }],
    status: "open",
    weeksInRow: 0,
    deadline: null,
    daysLeft: null,
    ...over,
  };
}
const goalsPatch = (list: GoalNumbers[], over: Patch<ReportParts["goals"]> = {}): Patch<ReportParts> => ({
  goals: { list, judged: list.length, reached: list.filter((g) => g.status === "met").length, ...over },
});

describe("the base week", () => {
  it("has nothing to say in any topic except neutral summaries", () => {
    const { insights } = insightsOf(BASE);
    for (const topic of ["focus", "time", "streaks", "blocked"] as const) {
      expect(insights[topic].good, topic).toEqual([]);
      expect(insights[topic].bad, topic).toEqual([]);
      expect(insights[topic].summary).not.toBe("");
    }
  });
});

describe("focus: going well", () => {
  it("more minutes than last week, with the percent", () => {
    expect(said(make({ focus: { lastWeek: week(100, 2), week: week(150) } }), "focus").good).toContain("2 h 30 min of focus, 50 % more than last week.");
  });
  it("is silent when last week was empty or not lower", () => {
    expect(said(make({ focus: { week: week(150) } }), "focus").good.join(" ")).not.toContain("more than last week");
    expect(said(make({ focus: { lastWeek: week(150, 2), week: week(150) } }), "focus").good.join(" ")).not.toContain("more than last week");
  });

  it("best of the 8 weeks", () => {
    const r = make({ focus: { week: week(200) } });
    expect(said(r, "focus").good).toContain("This is your best week of the last 8, with 3 h 20 min of focus.");
  });
  it("is silent when another week was as long, or all others were empty", () => {
    const tie = make({ focus: { week: week(120) } });
    expect(said(tie, "focus").good.join(" ")).not.toContain("best week");
    const alone = make({ focus: { week: week(200), weeks: BASE.focus.weeks.map((w, i) => ({ ...w, focusedMinutes: i === 7 ? 200 : 0 })) } });
    expect(said(alone, "focus").good.join(" ")).not.toContain("best week");
  });

  it("grew weeks in a row (3 or more)", () => {
    const grow = (steps: number) => BASE.focus.weeks.map((w, i) => ({ ...w, focusedMinutes: i >= 7 - steps ? 100 + (i - (7 - steps)) * 10 : 200 - i }));
    const r = make({ focus: { weeks: grow(3).map((w) => w) } });
    expect(said(r, "focus").good).toContain("Your focus time grew 3 weeks in a row.");
  });
  it("is silent for 2 weeks in a row", () => {
    const weeks = BASE.focus.weeks.map((w, i) => ({ ...w, focusedMinutes: i === 5 ? 100 : i === 6 ? 110 : i === 7 ? 120 : 300 }));
    expect(said(make({ focus: { weeks } }), "focus").good.join(" ")).not.toContain("weeks in a row");
  });

  it("the best block", () => {
    const r = make({ focus: { bestBlock: "morning", hours: [{ block: "morning", sessions: 3, score: 92 }] } });
    expect(said(r, "focus").good).toContain("Mornings carry the week: sessions at 9 – 11 am score 92 on average.");
  });
  it("is silent without a best block", () => {
    expect(said(BASE, "focus").good.join(" ")).not.toContain("carry");
  });

  it("sessions on at least 5 days", () => {
    expect(said(make({ focus: { activeDays: 5 } }), "focus").good).toContain("You focused on 5 days this week.");
    expect(said(make({ focus: { activeDays: 4 } }), "focus").good.join(" ")).not.toContain("days this week");
  });

  it("keeps at most 3", () => {
    const r = make({ focus: { week: week(200), lastWeek: week(100, 2), activeDays: 6, bestBlock: "morning", hours: [{ block: "morning", sessions: 3, score: 90 }] } });
    expect(said(r, "focus").good).toHaveLength(3);
  });
});

describe("focus: needs attention", () => {
  it("fewer minutes than last week", () => {
    expect(said(make({ focus: { lastWeek: week(240, 3), week: week(120) } }), "focus").bad).toContain("2 h of focus, 50 % less than last week.");
  });
  it("is silent when last week was empty", () => {
    expect(said(make({ focus: { week: week(60) } }), "focus").bad.join(" ")).not.toContain("less than last week");
  });

  it("a day under half of the best day", () => {
    const days = BASE.focus.days.map((d, i) => ({ ...d, focusedMinutes: i === 0 ? 100 : i === 2 ? 30 : 0, sessions: i === 0 || i === 2 ? 1 : 0 }));
    const r = make({ focus: { days, bestDay: { date: "2026-11-16", minutes: 100, sessions: 1 } } });
    expect(said(r, "focus").bad).toContain("Wednesday was your lightest day with 30 min, under half of Monday.");
  });
  it("is silent when the lightest day is at least half, or only one day had a session", () => {
    const days = BASE.focus.days.map((d, i) => ({ ...d, focusedMinutes: i === 0 ? 100 : i === 2 ? 50 : 0, sessions: i === 0 || i === 2 ? 1 : 0 }));
    expect(said(make({ focus: { days, bestDay: { date: "2026-11-16", minutes: 100, sessions: 1 } } }), "focus").bad.join(" ")).not.toContain("lightest");
    const one = BASE.focus.days.map((d, i) => ({ ...d, focusedMinutes: i === 0 ? 100 : 0, sessions: i === 0 ? 1 : 0 }));
    expect(said(make({ focus: { days: one, bestDay: { date: "2026-11-16", minutes: 100, sessions: 1 } } }), "focus").bad.join(" ")).not.toContain("lightest");
  });

  it("a block with 2 sessions or more 15 points below the best block", () => {
    const hours = [
      { block: "morning" as const, sessions: 3, score: 90 },
      { block: "late" as const, sessions: 2, score: 70 },
    ];
    expect(said(make({ focus: { bestBlock: "morning", hours } }), "focus").bad).toContain("Sessions after 4 pm score 70, 20 points below your best hours.");
  });
  it("is silent for a gap under 15, or a block with a single session", () => {
    const close = [{ block: "morning" as const, sessions: 3, score: 90 }, { block: "late" as const, sessions: 2, score: 76 }];
    expect(said(make({ focus: { bestBlock: "morning", hours: close } }), "focus").bad.join(" ")).not.toContain("points below");
    const single = [{ block: "morning" as const, sessions: 3, score: 90 }, { block: "late" as const, sessions: 1, score: 20 }];
    expect(said(make({ focus: { bestBlock: "morning", hours: single } }), "focus").bad.join(" ")).not.toContain("points below");
  });

  it("fewer than half of the sessions finished as planned", () => {
    expect(said(make({ focus: { finishedAsPlanned: 1 } }), "focus").bad).toContain("Only 1 of 4 sessions reached the planned length.");
  });
  it("is silent at exactly half", () => {
    expect(said(make({ focus: { finishedAsPlanned: 2 } }), "focus").bad.join(" ")).not.toContain("planned length");
  });
});

describe("goals: going well", () => {
  it("all judged goals met", () => {
    const met = (id: string) => goalNumbers(id, { status: "met", rules: [{ unit: "sessions", done: 2, target: 2, status: "met" }] });
    expect(said(make(goalsPatch([met("a"), met("b")])), "goals").good).toContain("All 2 goals are met this week.");
    expect(said(make(goalsPatch([met("a")])), "goals").good).toContain("Your goal is met this week.");
  });
  it("is silent when one goal is not met", () => {
    const met = goalNumbers("a", { status: "met" });
    expect(said(make(goalsPatch([met, goalNumbers("b")])), "goals").good.join(" ")).not.toContain("met this week");
  });

  it("a goal met 2 weeks in a row or more", () => {
    expect(said(make(goalsPatch([goalNumbers("a", { weeksInRow: 3 })])), "goals").good).toContain("Goal a has been met 3 weeks in a row.");
  });
  it("is silent for 1 week", () => {
    expect(said(make(goalsPatch([goalNumbers("a", { weeksInRow: 1 })])), "goals").good.join(" ")).not.toContain("in a row");
  });

  it("more goals reached than last week", () => {
    const lastWeeks = [{ monday: "2026-10-26", reached: 0, judged: 2 }, { monday: "2026-11-02", reached: 0, judged: 2 }, { monday: "2026-11-09", reached: 1, judged: 2 }, { monday: "2026-11-16", reached: 2, judged: 2 }];
    expect(said(make(goalsPatch([goalNumbers("a", { status: "met" }), goalNumbers("b", { status: "met" })], { lastWeeks })), "goals").good).toContain("2 goals reached, up from 1 last week.");
  });
  it("is silent when the number is the same or last week had no goals judged", () => {
    const same = [{ monday: "2026-10-26", reached: 0, judged: 0 }, { monday: "2026-11-02", reached: 0, judged: 0 }, { monday: "2026-11-09", reached: 1, judged: 2 }, { monday: "2026-11-16", reached: 1, judged: 2 }];
    const list = [goalNumbers("a", { status: "met" }), goalNumbers("b")];
    expect(said(make(goalsPatch(list, { lastWeeks: same })), "goals").good.join(" ")).not.toContain("up from");
    const none = same.map((w, i) => (i === 2 ? { ...w, judged: 0, reached: 0 } : w));
    expect(said(make(goalsPatch(list, { lastWeeks: none })), "goals").good.join(" ")).not.toContain("up from");
  });
});

describe("goals: needs attention", () => {
  const missed = goalNumbers("a", { status: "missed", rules: [{ unit: "sessions", done: 1, target: 3, status: "missed" }] });

  it("a missed goal, with how much is short", () => {
    expect(said(make(goalsPatch([missed])), "goals").bad).toContain("Goal a fell short: 1 of 3 sessions done, 2 short.");
    const hours = goalNumbers("h", { status: "missed", rules: [{ unit: "hours", done: 3.5, target: 6, status: "missed" }] });
    expect(said(make(goalsPatch([hours])), "goals").bad).toContain("Goal h fell short: 3.5 of 6 h done, 2.5 h short.");
    expect(said(make(goalsPatch([missed, goalNumbers("b", { status: "missed" })])), "goals").bad[0]).toContain("1 more goal fell short as well.");
  });
  it("an open goal speaks once its week is over, not while the week runs", () => {
    const open = goalNumbers("a");
    expect(said(make({ ...goalsPatch([open]), isCurrentWeek: false }), "goals").bad[0]).toContain("fell short");
    expect(said(make({ ...goalsPatch([open]), isCurrentWeek: true }), "goals").bad.join(" ")).not.toContain("fell short");
  });
  it("is silent for a met goal", () => {
    expect(said(make(goalsPatch([goalNumbers("a", { status: "met" })])), "goals").bad.join(" ")).not.toContain("fell short");
  });

  it("a goal not met for 2 weeks or more", () => {
    const r = make(goalsPatch([goalNumbers("a"), goalNumbers("b")]));
    expect(said(r, "goals", { notMetWeeks: { a: 2, b: 4 } }).bad).toContain("Goal b has not been met for 4 weeks.");
  });
  it("is silent for 1 week, or without the extra numbers", () => {
    const r = make(goalsPatch([goalNumbers("a")]));
    expect(said(r, "goals", { notMetWeeks: { a: 1 } }).bad.join(" ")).not.toContain("has not been met");
    expect(said(r, "goals").bad.join(" ")).not.toContain("has not been met");
  });

  it("planned sessions that were not done", () => {
    const item = (state: "done" | "not_done" | "planned") => ({ eventId: state, title: "t", goal: goalNumbers("a").goal, state });
    const plan = [{ date: "2026-11-16", items: [item("not_done"), item("done")] }, { date: "2026-11-17", items: [item("not_done")] }];
    expect(said(make(goalsPatch([goalNumbers("a")], { plan })), "goals").bad).toContain("2 planned sessions were not done.");
    expect(said(make(goalsPatch([goalNumbers("a")], { plan: [{ date: "2026-11-16", items: [item("not_done")] }] })), "goals").bad).toContain("1 planned session was not done.");
  });
  it("is silent when everything planned was done or is still ahead", () => {
    const item = (state: "done" | "planned") => ({ eventId: state, title: "t", goal: goalNumbers("a").goal, state });
    expect(said(make(goalsPatch([goalNumbers("a")], { plan: [{ date: "2026-11-16", items: [item("done"), item("planned")] }] })), "goals").bad.join(" ")).not.toContain("not done");
  });

  it("a deadline within 14 days whose goal is not met", () => {
    expect(said(make(goalsPatch([goalNumbers("a", { deadline: "2026-11-25", daysLeft: 7 })])), "goals").bad).toContain("Goal a is due in 7 days and is not met this week.");
    expect(said(make(goalsPatch([goalNumbers("a", { deadline: "2026-11-18", daysLeft: 0 })])), "goals").bad).toContain("Goal a is due today and is not met this week.");
  });
  it("is silent for a met goal, a far deadline, no deadline or a passed one", () => {
    for (const goal of [
      goalNumbers("a", { deadline: "2026-11-25", daysLeft: 7, status: "met" }),
      goalNumbers("a", { deadline: "2026-12-25", daysLeft: 37 }),
      goalNumbers("a"),
      goalNumbers("a", { deadline: "2026-11-10", daysLeft: -8 }),
    ]) {
      expect(said(make(goalsPatch([goal])), "goals").bad.join(" ")).not.toContain("is due");
    }
  });
});

describe("time", () => {
  const area = (id: string | null, minutes: number, lastWeekMinutes = 0) => ({ goal: id === null ? null : goalNumbers(id).goal, minutes, lastWeekMinutes });

  it("good: more done minutes than last week", () => {
    expect(said(make({ time: { doneMinutes: 150, lastWeekDoneMinutes: 100 } }), "time").good).toContain("You got 2 h 30 min done, 50 % more than last week.");
  });
  it("is silent when last week had none or was higher", () => {
    expect(said(make({ time: { doneMinutes: 150, lastWeekDoneMinutes: 0 } }), "time").good.join(" ")).not.toContain("more than last week");
    expect(said(make({ time: { doneMinutes: 150, lastWeekDoneMinutes: 200 } }), "time").good.join(" ")).not.toContain("more than last week");
  });

  it("good: 70 % or more on goals", () => {
    expect(said(make({ time: { doneMinutes: 100, goalMinutes: 70 } }), "time").good).toContain("70 % of your done time went to your goals.");
    expect(said(make({ time: { doneMinutes: 100, goalMinutes: 69 } }), "time").good.join(" ")).not.toContain("went to your goals");
  });

  it("good: plan kept 80 % or more", () => {
    expect(said(make({ time: { planKept: 80 } }), "time").good).toContain("You kept 80 % of your plan.");
    expect(said(make({ time: { planKept: 79 } }), "time").good.join(" ")).not.toContain("of your plan");
  });

  it("bad: plan kept under 60 %", () => {
    expect(said(make({ time: { planKept: 59 } }), "time").bad).toContain("Only 59 % of your plan was kept.");
    expect(said(make({ time: { planKept: 60 } }), "time").bad.join(" ")).not.toContain("of your plan");
    expect(said(make({ time: { planKept: null } }), "time").bad.join(" ")).not.toContain("of your plan");
  });

  it("bad: 'No goal' is the largest area", () => {
    const r = make({ ...goalsPatch([goalNumbers("a")]), time: { areas: [area(null, 80), area("a", 20)] } });
    expect(said(r, "time").bad).toContain("Most of your time, 1 h 20 min, went to events without a goal.");
  });
  it("is silent when a goal is the largest, on a tie, or when there are no goals", () => {
    expect(said(make({ ...goalsPatch([goalNumbers("a")]), time: { areas: [area("a", 80), area(null, 20)] } }), "time").bad.join(" ")).not.toContain("without a goal");
    expect(said(make({ ...goalsPatch([goalNumbers("a")]), time: { areas: [area(null, 50), area("a", 50)] } }), "time").bad.join(" ")).not.toContain("without a goal");
    expect(said(make({ time: { areas: [area(null, 80)] } }), "time").bad.join(" ")).not.toContain("without a goal");
  });

  it("bad: a goal with rules got no time", () => {
    const r = make({ ...goalsPatch([goalNumbers("a"), goalNumbers("b")]), time: { areas: [area("a", 60)] } });
    expect(said(r, "time").bad).toContain("No time went to Goal b.");
    const three = make({ ...goalsPatch([goalNumbers("a"), goalNumbers("b"), goalNumbers("c"), goalNumbers("d")]), time: { areas: [area("a", 60)] } });
    expect(said(three, "time").bad).toContain("No time went to Goal b and Goal c and 1 more.");
  });
  it("is silent when every goal got time", () => {
    const r = make({ ...goalsPatch([goalNumbers("a")]), time: { areas: [area("a", 60)] } });
    expect(said(r, "time").bad.join(" ")).not.toContain("No time went");
  });
});

describe("streaks", () => {
  it("good: a streak of 3 days or more", () => {
    expect(said(make({ streaks: { current: 3, record: 9 } }), "streaks").good).toContain("You are on a 3-day streak.");
    expect(said(make({ streaks: { current: 2, record: 9 } }), "streaks").good).toEqual([]);
  });
  it("good: the streak equals the record", () => {
    expect(said(make({ streaks: { current: 5, record: 5 } }), "streaks").good).toContain("That equals your record of 5 days.");
    expect(said(make({ streaks: { current: 5, record: 6 } }), "streaks").good.join(" ")).not.toContain("record");
    expect(said(make({ streaks: { current: 2, record: 2 } }), "streaks").good).toEqual([]);
  });
  it("good: at least 60 of 84 days active", () => {
    const heat = (n: number) => empty.focus.heat.map((d, i) => ({ ...d, minutes: i < n ? 30 : 0, level: (i < n ? 1 : 0) as 0 | 1 }));
    expect(said(make({ focus: { heat: heat(60) } }), "streaks").good).toContain("You focused on 60 of the last 84 days.");
    expect(said(make({ focus: { heat: heat(59) } }), "streaks").good.join(" ")).not.toContain("of the last 84 days");
  });

  it("bad: the streak is 0", () => {
    expect(said(make({ streaks: { current: 0, record: 6 } }), "streaks").bad).toContain("Your streak is at 0 days. Your record is 6 days.");
    expect(said(make({ streaks: { current: 1, record: 6 } }), "streaks").bad.join(" ")).not.toContain("at 0 days");
  });
  it("bad: a weekday without a session in 4 weeks, in one sentence", () => {
    expect(said(make({ focus: { weekdays: [3, 2, 1, 4, 1, 0, 0] } }), "streaks").bad).toContain("No sessions on Saturdays and Sundays in the last 4 weeks.");
    expect(said(make({ focus: { weekdays: [3, 2, 1, 4, 1, 1, 0] } }), "streaks").bad).toContain("No sessions on Sundays in the last 4 weeks.");
  });
  it("is silent when every weekday had a session", () => {
    expect(said(make({ focus: { weekdays: [1, 1, 1, 1, 1, 1, 1] } }), "streaks").bad.join(" ")).not.toContain("No sessions on");
  });
});

describe("distractions", () => {
  it("good: fewer visits than last week", () => {
    expect(said(make({ blocked: { week: 1, lastWeek: 4 } }), "blocked").good).toContain("1 blocked visit, down from 4 last week.");
    expect(said(make({ blocked: { week: 4, lastWeek: 4 } }), "blocked").good.join(" ")).not.toContain("down from");
  });
  it("good: the lowest of the 8 weeks", () => {
    const weeks = BASE.focus.weeks.map((w, i) => ({ ...w, attempts: i === 7 ? 1 : 4 }));
    expect(said(make({ focus: { weeks }, blocked: { week: 1, lastWeek: 1 } }), "blocked").good).toContain("1 blocked visit is your lowest in 8 weeks.");
    const tie = BASE.focus.weeks.map((w, i) => ({ ...w, attempts: i === 7 ? 1 : i === 3 ? 1 : 4 }));
    expect(said(make({ focus: { weeks: tie }, blocked: { week: 1, lastWeek: 1 } }), "blocked").good.join(" ")).not.toContain("lowest");
  });
  it("good: at least half of the sessions clean", () => {
    expect(said(make({ blocked: { cleanSessions: 2 } }), "blocked").good).toContain("2 of 4 sessions had no blocked visit.");
    expect(said(make({ blocked: { cleanSessions: 1 } }), "blocked").good.join(" ")).not.toContain("had no blocked visit");
  });

  it("bad: more visits than last week", () => {
    expect(said(make({ focus: { lastWeek: BASE_LAST }, blocked: { week: 5, lastWeek: 2 } }), "blocked").bad).toContain("5 blocked visits, up from 2 last week.");
    expect(said(make({ blocked: { week: 3, lastWeek: 3 } }), "blocked").bad.join(" ")).not.toContain("up from");
  });
  it("bad: no comparison when the week before is empty", () => {
    expect(said(make({ focus: { lastWeek: week(0, 0) }, blocked: { week: 5, lastWeek: 0 } }), "blocked").bad.join(" ")).not.toContain("up from");
  });
  it("bad: the worst block holds at least 40 % of the visits", () => {
    const hours = ZERO_HOURS.map((h) => (h.block === "late" ? { ...h, count: 4 } : h.block === "early" ? { ...h, count: 6 } : h));
    expect(said(make({ blocked: { week: 10, lastWeek: 10, worstBlock: "early", hours } }), "blocked").bad).toContain("6 of 10 blocked visits came before 9 am.");
    const spread = ZERO_HOURS.map((h) => ({ ...h, count: 2 }));
    expect(said(make({ blocked: { week: 10, lastWeek: 10, worstBlock: "early", hours: spread } }), "blocked").bad.join(" ")).not.toContain("blocked visits came");
  });
  it("bad: one site makes up at least 40 % of the visits", () => {
    expect(said(make({ blocked: { week: 10, lastWeek: 10, topSites: [{ domain: "reddit.com", count: 4 }, { domain: "x.com", count: 3 }] } }), "blocked").bad).toContain("reddit.com makes up 4 of 10 blocked visits.");
    expect(said(make({ blocked: { week: 10, lastWeek: 10, topSites: [{ domain: "reddit.com", count: 3 }] } }), "blocked").bad.join(" ")).not.toContain("makes up");
  });
  it("bad: a few visits are not enough for the share rules", () => {
    const hours = ZERO_HOURS.map((h) => (h.block === "late" ? { ...h, count: 2 } : h));
    expect(said(make({ blocked: { week: 2, lastWeek: 2, worstBlock: "late", hours, topSites: [{ domain: "x.com", count: 2 }] } }), "blocked").bad).toEqual([]);
  });
});

describe("summaries", () => {
  it("an empty report says so plainly, with empty lists", () => {
    const { insights, summary } = insightsOf(empty);
    expect(insights.focus).toEqual({ good: [], bad: [], summary: "No focus sessions this week yet." });
    for (const topic of ["goals", "time", "streaks", "blocked"] as const) {
      expect(insights[topic].good).toEqual([]);
      expect(insights[topic].bad).toEqual([]);
      expect(insights[topic].summary).not.toBe("");
    }
    expect(summary).toBe("Nothing tracked this week yet.");
  });

  it("a topic's summary is its strongest good and its strongest bad sentence", () => {
    const r = make({ focus: { week: week(150), lastWeek: week(100, 2), finishedAsPlanned: 0 } });
    expect(said(r, "focus").summary).toBe("2 h 30 min of focus, 50 % more than last week. Only 0 of 4 sessions reached the planned length.");
  });

  it("a topic with only a neutral fact says that", () => {
    expect(said(BASE, "focus").summary).toBe("2 h of focus in 4 sessions this week.");
    expect(said(BASE, "blocked").summary).toBe("2 blocked visits this week.");
  });

  it("a strong week", () => {
    const met = (id: string) => goalNumbers(id, { status: "met", rules: [{ unit: "sessions", done: 2, target: 2, status: "met" }] });
    const r = make({ ...goalsPatch([met("a"), met("b"), met("c"), goalNumbers("d")]), focus: { week: week(690, 14), lastWeek: week(300, 5), finishedAsPlanned: 14 }, time: { planKept: 90 }, isCurrentWeek: false });
    expect(insightsOf(r).summary).toBe("A strong week: 11 h 30 min of focus in 14 sessions and 3 of 4 goals reached. Goal d fell short: 1 of 2 sessions done, 1 short.");
  });

  it("a weak week, with what needs attention most", () => {
    const missed = goalNumbers("a", { status: "missed", rules: [{ unit: "sessions", done: 0, target: 3, status: "missed" }] });
    const r = make({ ...goalsPatch([missed, goalNumbers("b", { status: "missed" })]), focus: { week: week(60, 1), lastWeek: week(300, 5), finishedAsPlanned: 0 } });
    expect(insightsOf(r).summary).toBe("A slower week: 1 h of focus in 1 session and 0 of 2 goals reached. Goal a fell short: 0 of 3 sessions done, 3 short. 1 more goal fell short as well.");
  });

  it("a week with only events and no sessions", () => {
    const r = make({ focus: { week: week(0, 0), lastWeek: week(0, 0), weeks: BASE.focus.weeks.map((w) => ({ ...w, focusedMinutes: 0, sessions: 0 })) } });
    expect(insightsOf(r).summary.startsWith("A quiet week: no focus sessions.")).toBe(true);
  });
});
