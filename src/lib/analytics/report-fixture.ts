// Two complete reports for the Analytics page (spec 49), for tests and previews: the sample week of the
// owner's mockup (week 46, Nov 9 – 15 2026: 11h 30m of focus in 14 sessions, score 82, four goals) and
// the report of a new account with nothing in it yet. Plain data; nothing here calculates a number the
// server would calculate, except for spreading the sample's 84 heat days.
import type { AnalyticsReport, GoalRef, HourBlockId, PlanItem } from "./report-types";
import { addDays } from "@/lib/time/zoned";

const MONDAY = "2026-11-09";
const day = (i: number) => addDays(MONDAY, i);

const thesis: GoalRef = { id: "g-thesis", title: "Thesis", color: "indigo", icon: "graduation" };
const run: GoalRef = { id: "g-run", title: "Run 10k", color: "teal", icon: "footprints" };
const apps: GoalRef = { id: "g-apps", title: "Applications", color: "amber", icon: "briefcase" };
const read: GoalRef = { id: "g-read", title: "Read more", color: "rose", icon: "book" };

const WEEK_MONDAYS = ["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", MONDAY];
const BLOCKS: HourBlockId[] = ["early", "morning", "midday", "afternoon", "late"];

// Focus minutes, sessions, score and blocked visits per day of the sample week (Monday first).
const DAYS: [number, number, number | null, number][] = [
  [120, 2, 84, 3],
  [95, 2, 78, 4],
  [150, 3, 86, 5],
  [60, 2, 71, 3],
  [135, 3, 85, 5],
  [0, 0, null, 0],
  [130, 2, 88, 3],
];

/** 84 days ending with the sample Sunday; the last seven are the sample week. */
function sampleHeat(): AnalyticsReport["focus"]["heat"] {
  const minutesOfLevel = [0, 40, 90, 150];
  const first = addDays(MONDAY, -77);
  return Array.from({ length: 84 }, (_, i) => {
    let minutes: number;
    if (i >= 77) minutes = DAYS[i - 77][0];
    else {
      const r = (i * 37 + 11) % 10;
      let level = r < 2 ? 0 : r < 5 ? 1 : r < 8 ? 2 : 3;
      if (i % 7 === 5 && r < 6) level = 0;
      minutes = minutesOfLevel[level];
    }
    const level = minutes === 0 ? 0 : minutes < 60 ? 1 : minutes < 120 ? 2 : 3;
    return { date: addDays(first, i), minutes, level };
  });
}

const item = (eventId: string, goal: GoalRef, state: PlanItem["state"]): PlanItem => ({ eventId, title: `${goal.title} session`, goal, state });

export const sampleReport: AnalyticsReport = {
  timeZone: "Europe/Lisbon",
  monday: MONDAY,
  previous: "2026-11-02",
  next: "2026-11-16",
  thisWeek: "2026-11-16",
  today: null,
  isCurrentWeek: false,
  focus: {
    week: { focusedMinutes: 690, sessions: 14, score: 82, attempts: 23 },
    lastWeek: { focusedMinutes: 580, sessions: 12, score: 76, attempts: 31 },
    days: DAYS.map(([focusedMinutes, sessions, score, attempts], i) => ({ date: day(i), focusedMinutes, sessions, score, attempts })),
    weeks: [
      [370, 8, 70, 44],
      [450, 9, 72, 41],
      [345, 7, 68, 46],
      [500, 10, 74, 40],
      [545, 11, 77, 38],
      [470, 10, 75, 35],
      [580, 12, 76, 31],
      [690, 14, 82, 23],
    ].map(([focusedMinutes, sessions, score, attempts], i) => ({ monday: WEEK_MONDAYS[i], focusedMinutes, sessions, score, attempts })),
    averageMinutes: 494,
    finishedAsPlanned: 10,
    activeDays: 6,
    hours: [
      { block: "early", sessions: 9, score: 78 },
      { block: "morning", sessions: 22, score: 91 },
      { block: "midday", sessions: 18, score: 84 },
      { block: "afternoon", sessions: 15, score: 76 },
      { block: "late", sessions: 12, score: 64 },
    ],
    bestBlock: "morning",
    longest: { minutes: 95, date: day(6), goal: "Thesis" },
    bestScore: { score: 96, date: day(4) },
    bestDay: { date: day(2), minutes: 150, sessions: 3 },
    weekdays: [8, 8, 10, 7, 9, 1, 4],
    weekdaySessions: 47,
    heat: sampleHeat(),
  },
  goals: {
    list: [
      { goal: thesis, rules: [{ unit: "sessions", done: 4, target: 4, status: "met" }], status: "met", weeksInRow: 2, deadline: "2026-12-18", daysLeft: 30 },
      { goal: run, rules: [{ unit: "sessions", done: 3, target: 3, status: "met" }], status: "met", weeksInRow: 3, deadline: "2026-12-06", daysLeft: 18 },
      { goal: apps, rules: [{ unit: "sessions", done: 2, target: 4, status: "missed" }], status: "missed", weeksInRow: 0, deadline: "2026-11-30", daysLeft: 12 },
      { goal: read, rules: [{ unit: "hours", done: 2.1, target: 2, status: "met" }], status: "met", weeksInRow: 2, deadline: null, daysLeft: null },
    ],
    reached: 3,
    judged: 4,
    lastWeeks: [
      { monday: "2026-10-19", reached: 1, judged: 4 },
      { monday: "2026-10-26", reached: 1, judged: 4 },
      { monday: "2026-11-02", reached: 3, judged: 4 },
      { monday: MONDAY, reached: 3, judged: 4 },
    ],
    plan: [
      [item("e1", thesis, "done"), item("e2", read, "done")],
      [item("e3", apps, "done"), item("e4", run, "done")],
      [item("e5", thesis, "done"), item("e6", read, "done"), item("e7", apps, "not_done")],
      [item("e8", apps, "done"), item("e9", read, "done"), item("e10", run, "done")],
      [item("e11", thesis, "done"), item("e12", read, "done"), item("e13", apps, "not_done")],
      [item("e14", run, "done")],
      [item("e15", thesis, "done"), item("e16", read, "done")],
    ].map((items, i) => ({ date: day(i), items })),
    planDone: 14,
    planTotal: 16,
    slipped: [
      { eventId: "e7", title: "Applications session", goal: apps, startAt: "2026-11-11T16:00:00Z", minutes: 45 },
      { eventId: "e13", title: "Applications session", goal: apps, startAt: "2026-11-13T17:30:00Z", minutes: 45 },
    ],
  },
  time: {
    days: [
      [["g-thesis", 95], ["g-read", 25]],
      [[null, 50], ["g-apps", 45]],
      [["g-thesis", 90], [null, 35], ["g-read", 25]],
      [["g-apps", 45], ["g-read", 15]],
      [["g-thesis", 60], [null, 50], ["g-read", 25]],
      [],
      [["g-thesis", 95], ["g-read", 35]],
    ].map((parts, i) => {
      const list = (parts as [string | null, number][]).map(([goalId, minutes]) => ({ goalId, minutes }));
      return { date: day(i), minutes: list.reduce((sum, p) => sum + p.minutes, 0), parts: list };
    }),
    areas: [
      { goal: thesis, minutes: 340, lastWeekMinutes: 290 },
      { goal: null, minutes: 135, lastWeekMinutes: 100 },
      { goal: read, minutes: 125, lastWeekMinutes: 110 },
      { goal: apps, minutes: 90, lastWeekMinutes: 80 },
    ],
    doneMinutes: 690,
    lastWeekDoneMinutes: 580,
    goalMinutes: 555,
    busiest: { date: day(2), minutes: 150, events: 3 },
    quietest: { date: day(5), minutes: 0 },
    endedMinutes: 850,
    planKept: 81,
    planKeptLastWeek: 77,
  },
  streaks: { current: 9, record: 14 },
  blocked: {
    week: 23,
    lastWeek: 31,
    perSession: 1.6,
    sessionsClean: [true, true, false, true, false, false, true, false, false, true, false, false, false, true],
    cleanSessions: 6,
    hours: [
      { block: "early", count: 1 },
      { block: "morning", count: 2 },
      { block: "midday", count: 4 },
      { block: "afternoon", count: 6 },
      { block: "late", count: 10 },
    ],
    worstBlock: "late",
    topSites: [
      { domain: "instagram.com", count: 9 },
      { domain: "youtube.com", count: 6 },
      { domain: "linkedin.com", count: 4 },
      { domain: "reddit.com", count: 3 },
      { domain: "x.com", count: 1 },
    ],
  },
  insights: {
    focus: {
      good: ["19 % more focus time than last week", "Your best week of the last 8", "Sessions on 6 of 7 days"],
      bad: ["Sessions after 4 pm score lowest (64)", "Thursday had only 1h of focus"],
      summary: "Your strongest week in two months: 1h 50m more focus than last week, mostly in the morning.",
    },
    goals: {
      good: ["3 of 4 goals reached", "Run 10k: 3 weeks in a row"],
      bad: ["Applications: 2 sessions short", "2 planned sessions slipped"],
      summary: "Three goals on target. Applications is the one that keeps slipping.",
    },
    time: {
      good: ["81 % of your planned time done", "80 % of your done time went to a goal"],
      bad: ["Saturday had nothing done"],
      summary: "Most of your time went to Thesis; Wednesday was the busiest day.",
    },
    streaks: {
      good: ["9 days in a row", "Focus on 4 weekdays out of 5"],
      bad: ["5 days short of your record of 14"],
      summary: "A steady streak of 9 days. Weekends stay quiet.",
    },
    blocked: {
      good: ["Blocked visits down from 31 to 23", "Your lowest in 8 weeks"],
      bad: ["Most blocked visits come after 4 pm", "instagram.com was blocked 9 times"],
      summary: "Fewer distractions than any week before. Late afternoons are still the weak spot.",
    },
  },
  summary: "A strong week: 11h 30m of focus in 14 sessions and 3 of 4 goals reached. Applications keeps slipping.",
};

/** A new account: the same week, and nothing in it. */
export const emptyReport: AnalyticsReport = {
  timeZone: "Europe/Lisbon",
  monday: MONDAY,
  previous: "2026-11-02",
  next: "2026-11-16",
  thisWeek: "2026-11-16",
  today: null,
  isCurrentWeek: false,
  focus: {
    week: { focusedMinutes: 0, sessions: 0, score: null, attempts: 0 },
    lastWeek: { focusedMinutes: 0, sessions: 0, score: null, attempts: 0 },
    days: Array.from({ length: 7 }, (_, i) => ({ date: day(i), focusedMinutes: 0, sessions: 0, score: null, attempts: 0 })),
    weeks: WEEK_MONDAYS.map((monday) => ({ monday, focusedMinutes: 0, sessions: 0, score: null, attempts: 0 })),
    averageMinutes: 0,
    finishedAsPlanned: 0,
    activeDays: 0,
    hours: BLOCKS.map((block) => ({ block, sessions: 0, score: null })),
    bestBlock: null,
    longest: null,
    bestScore: null,
    bestDay: null,
    weekdays: [0, 0, 0, 0, 0, 0, 0],
    weekdaySessions: 0,
    heat: Array.from({ length: 84 }, (_, i) => ({ date: addDays(MONDAY, i - 77), minutes: 0, level: 0 as const })),
  },
  goals: {
    list: [],
    reached: 0,
    judged: 0,
    lastWeeks: WEEK_MONDAYS.slice(4).map((monday) => ({ monday, reached: 0, judged: 0 })),
    plan: Array.from({ length: 7 }, (_, i) => ({ date: day(i), items: [] })),
    planDone: 0,
    planTotal: 0,
    slipped: [],
  },
  time: {
    days: Array.from({ length: 7 }, (_, i) => ({ date: day(i), minutes: 0, parts: [] })),
    areas: [],
    doneMinutes: 0,
    lastWeekDoneMinutes: 0,
    goalMinutes: 0,
    busiest: null,
    quietest: null,
    endedMinutes: 0,
    planKept: null,
    planKeptLastWeek: null,
  },
  streaks: { current: 0, record: 0 },
  blocked: {
    week: 0,
    lastWeek: 0,
    perSession: null,
    sessionsClean: [],
    cleanSessions: 0,
    hours: BLOCKS.map((block) => ({ block, count: 0 })),
    worstBlock: null,
    topSites: [],
  },
  insights: {
    focus: { good: [], bad: [], summary: "No focus sessions this week yet." },
    goals: { good: [], bad: [], summary: "No goals with a weekly target yet." },
    time: { good: [], bad: [], summary: "Nothing marked done in your calendar this week yet." },
    streaks: { good: [], bad: [], summary: "Finish a focus session to start a streak." },
    blocked: { good: [], bad: [], summary: "No blocked visits this week." },
  },
  summary: "Nothing to show for this week yet. Finish a focus session or mark a goal event done, and your numbers appear here.",
};
