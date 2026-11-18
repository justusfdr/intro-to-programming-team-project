// The report over several weeks that "Export" turns into a PDF (spec 49): which period and which parts
// may be asked for, and the numbers a report holds. Pure: no database, no React. The numbers are filled
// by buildPeriod (src/lib/analytics/period-build.ts) and drawn by src/lib/server/analytics/pdf.ts.
import type { WeekStatus } from "@/lib/goals/progress";
import { addDays, isLocalDate, mondayOf, type LocalDate } from "@/lib/time/zoned";
import type { GoalRef, HourBlockId } from "./report-types";

/** The parts of a report, in the order they are printed. */
export const PARTS = ["summary", "goals", "productivity", "time", "trends", "blocked"] as const;
export type Part = (typeof PARTS)[number];
export const PART_LABELS: Record<Part, { title: string; about: string }> = {
  summary: { title: "Summary", about: "What went well and what did not, in a few sentences" },
  goals: { title: "Goals", about: "Reached or not, week by week" },
  productivity: { title: "Productivity", about: "Focus sessions, focus time and focus score" },
  time: { title: "Time facts", about: "Where your time went, your best day and best hours" },
  trends: { title: "Trends and charts", about: "Graphs across the weeks you picked" },
  blocked: { title: "Blocked sites", about: "How often you were stopped, and on which sites" },
};

export const MAX_WEEKS = 26;

export const PERIOD_MESSAGES = {
  badWeek: "Choose a first and a last week",
  wrongOrder: "The first week must not be after the last week",
  tooLong: "A report covers at most 26 weeks",
  future: "A report cannot include weeks that have not started",
  noParts: "Choose at least one part",
  badPart: "Choose parts from the list",
} as const;

export type Period = { from: LocalDate; to: LocalDate; weeks: number };
export type PeriodCheck = { ok: true; period: Period; parts: Part[] } | { ok: false; message: string };

function weeksBetween(from: LocalDate, to: LocalDate): number {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  return days / 7 + 1;
}

/**
 * Checks what an export asks for. `from` and `to` are the Mondays of the first and the last week
 * (any day of a week is taken as its Monday); `today` is today's date in the user's time zone. The
 * last week may be the current one. `parts` is a list or a comma-separated text; the answer has the
 * parts in printing order, each once.
 */
export function checkPeriod(input: { from: unknown; to: unknown; parts: unknown }, today: LocalDate): PeriodCheck {
  if (typeof input.from !== "string" || typeof input.to !== "string" || !isLocalDate(input.from) || !isLocalDate(input.to)) {
    return { ok: false, message: PERIOD_MESSAGES.badWeek };
  }
  const from = mondayOf(input.from);
  const to = mondayOf(input.to);
  if (from > to) return { ok: false, message: PERIOD_MESSAGES.wrongOrder };
  if (to > mondayOf(today)) return { ok: false, message: PERIOD_MESSAGES.future };
  const weeks = weeksBetween(from, to);
  if (weeks > MAX_WEEKS) return { ok: false, message: PERIOD_MESSAGES.tooLong };

  const asked = typeof input.parts === "string" ? input.parts.split(",").filter((p) => p !== "") : input.parts;
  if (!Array.isArray(asked)) return { ok: false, message: PERIOD_MESSAGES.noParts };
  if (asked.some((p) => typeof p !== "string" || !(PARTS as readonly string[]).includes(p))) return { ok: false, message: PERIOD_MESSAGES.badPart };
  const parts = PARTS.filter((p) => asked.includes(p));
  if (parts.length === 0) return { ok: false, message: PERIOD_MESSAGES.noParts };

  return { ok: true, period: { from, to, weeks }, parts };
}

/** The periods the dialog offers: whole weeks that are over, ending with last week. */
export function presetPeriod(weeks: number, today: LocalDate): Period {
  const to = addDays(mondayOf(today), -7);
  return { from: addDays(to, -7 * (weeks - 1)), to, weeks };
}

/** The last day of a period: the Sunday of its last week. */
export function lastDayOf(period: Pick<Period, "to">): LocalDate {
  return addDays(period.to, 6);
}

// ---- The numbers of a report ----

export type PeriodWeek = {
  monday: LocalDate;
  focusedMinutes: number;
  sessions: number;
  /** Null without sessions. */
  averageSessionMinutes: number | null;
  score: number | null;
  attempts: number;
  /** Minutes of done timed events. */
  doneMinutes: number;
  goalsReached: number;
  goalsJudged: number;
};

/** One goal across the weeks of the report. */
export type PeriodGoal = {
  goal: GoalRef;
  /** One entry per week of the report, oldest first. `text` is "3 of 4" or "2.5 of 6 h" for the goal's first rule; null when the week is not judged (before the goal existed or after its deadline's week). */
  weeks: { monday: LocalDate; text: string | null; status: WeekStatus | null }[];
  metWeeks: number;
  judgedWeeks: number;
};

export type PeriodReport = {
  period: Period;
  /** Today's date in the user's time zone. */
  createdOn: LocalDate;
  /** True when the period has no session, no done event and no blocked visit. */
  empty: boolean;
  weeks: PeriodWeek[];
  totals: {
    focusedMinutes: number;
    sessions: number;
    averageSessionMinutes: number | null;
    score: number | null;
    attempts: number;
    doneMinutes: number;
    goalMinutes: number;
    /** Days with at least one finished session, and the days of the period. */
    activeDays: number;
    days: number;
  };
  /** Focused minutes and blocked visits of the same number of weeks right before the period. */
  before: { focusedMinutes: number; attempts: number };
  goals: PeriodGoal[];
  goalWeeksMet: number;
  goalWeeksJudged: number;
  /** Done minutes per goal ("No goal": goal null), most first; only those with minutes. */
  areas: { goal: GoalRef | null; minutes: number }[];
  /** Finished sessions per weekday, 0 = Monday. */
  weekdays: number[];
  hours: { block: HourBlockId; sessions: number; score: number | null }[];
  bestBlock: HourBlockId | null;
  longest: { minutes: number; date: LocalDate; goal: string | null } | null;
  topSites: { domain: string; count: number }[];
  insights: { good: string[]; bad: string[]; summary: string };
};
