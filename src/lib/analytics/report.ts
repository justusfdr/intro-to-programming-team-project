// The numbers of the Analytics page (spec 49), worked out from plain lists. Pure functions: no
// database, no React. The server reads the rows (src/lib/server/analytics/report.ts) and hands
// them over; the same input always gives the same numbers. Nothing here is saved.
//
// Days and weeks are counted in the user's time zone (R2): weeks run Monday 00:00 to Sunday 24:00,
// a session or an event belongs to the day it starts, a blocked visit to the day it happened.
import {
  ruleAmount,
  ruleStatus,
  type DoneEvent,
  type Rule,
  type WeekStatus,
} from "@/lib/goals/progress";
import type { GoalColorName, GoalIconName } from "@/lib/goals/style";
import { addDays, localDateOf, mondayOf, startOfLocalDate, wallClock, type LocalDate } from "@/lib/time/zoned";
import {
  HOUR_BLOCKS,
  type AnalyticsReport,
  type BlockedNumbers,
  type FocusNumbers,
  type GoalNumbers,
  type GoalRef,
  type GoalsNumbers,
  type HourBlockId,
  type PlanItem,
  type RuleNumbers,
  type StreakNumbers,
  type TimeNumbers,
  type WeekNumbers,
} from "./report-types";
import { averageScore, attemptsDuring, sessionScore, weekAnalytics, type Attempt } from "./score";

/** A finished session, with the goal of the event it belongs to (null: none, or the goal was deleted). */
export type ReportSession = {
  startedAt: Date;
  endedAt: Date;
  plannedMinutes: number;
  focusedMinutes: number;
  goalId: string | null;
  goalTitle: string | null;
};

/** A timed event (all-day events never count). */
export type ReportEvent = {
  id: string;
  title: string;
  goalId: string | null;
  startAt: Date;
  endAt: Date;
  status: "planned" | "done";
};

export type ReportGoal = {
  id: string;
  title: string;
  color: GoalColorName;
  icon: GoalIconName;
  deadline: LocalDate | null;
  createdAt: Date;
  rules: Rule[];
};

export type ReportInput = {
  /** Finished sessions that started in the 84 days ending with the shown week's Sunday. */
  sessions: ReportSession[];
  /** Blocked visits of the same days, and those just after that lie inside one of the sessions. */
  attempts: Attempt[];
  /** Timed events of the shown week and the week before, and the events of a goal back to the first of the 12 weeks. */
  events: ReportEvent[];
  goals: ReportGoal[];
  now: Date;
  /** The Monday of the shown week. */
  monday: LocalDate;
  timeZone: string;
};

/** Everything of the report except the sentences. */
export type ReportParts = Omit<AnalyticsReport, "insights" | "summary">;

export const WEEKS_SHOWN = 8;
export const HEAT_DAYS = 84;
/** How many weeks back a goal's row of weeks is followed (the events are read back that far). */
export const GOAL_HISTORY_WEEKS = 12;
const MINUTE = 60_000;

const minutesOfRange = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / MINUTE);

/** The Mondays of the `count` weeks ending with the week of `monday`, oldest first. */
export function weeksEnding(monday: LocalDate, count: number): LocalDate[] {
  return Array.from({ length: count }, (_, i) => addDays(monday, -7 * (count - 1 - i)));
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (24 * 60 * MINUTE));
}

/** The part of the day an hour (0 to 23) belongs to. */
export function blockOfHour(hour: number): HourBlockId {
  return HOUR_BLOCKS.find((b) => hour >= b.from && hour < b.until)!.id;
}

/** The part of the day `instant` falls in, in the user's time zone. */
export function blockOf(instant: Date, timeZone: string): HourBlockId {
  return blockOfHour(wallClock(instant, timeZone).hour);
}

/** 0 for no focus, 1 under 60 minutes, 2 under 120, 3 for 120 and more. */
export function heatLevel(minutes: number): 0 | 1 | 2 | 3 {
  if (minutes <= 0) return 0;
  if (minutes < 60) return 1;
  return minutes < 120 ? 2 : 3;
}

type Dated = { session: ReportSession; date: LocalDate; score: number };

/** Every session with the day it starts on and its score (R19), worked out once. */
function datedSessions(sessions: ReportSession[], attempts: Attempt[], timeZone: string): Dated[] {
  return sessions
    .map((session) => ({ session, date: localDateOf(session.startedAt, timeZone), score: sessionScore(session, attemptsDuring(session, attempts)) }))
    .sort((a, b) => a.session.startedAt.getTime() - b.session.startedAt.getTime());
}

const weekDates = (monday: LocalDate) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** The R20 numbers of the week from `monday`. */
function weekTotals(sessions: ReportSession[], attempts: Attempt[], monday: LocalDate, timeZone: string) {
  const days = new Set(weekDates(monday));
  const own = sessions.filter((s) => days.has(localDateOf(s.startedAt, timeZone)));
  return weekAnalytics(own, attempts, monday, timeZone);
}

/**
 * Issue #126: while the shown week is still running, "last week" only counts up to the same moment
 * of last week (now minus 7 days). Wednesday noon is then compared with last Wednesday noon, not
 * with a whole week. For a week that is over this returns null and the whole last week counts.
 */
export function lastWeekCutoff(monday: LocalDate, now: Date | undefined, timeZone: string): Date | null {
  if (now === undefined) return null;
  const end = startOfLocalDate(addDays(monday, 7), timeZone);
  return now < end ? new Date(now.getTime() - 7 * 24 * 60 * MINUTE) : null;
}

/** The sessions and visits that happened before `cutoff`; all of them without a cutoff. */
function before<T>(list: T[], at: (item: T) => Date, cutoff: Date | null): T[] {
  return cutoff === null ? list : list.filter((item) => at(item) < cutoff);
}

// ---- Focus ----

export function focusNumbers(input: Pick<ReportInput, "sessions" | "attempts" | "monday" | "timeZone"> & { now?: Date }): FocusNumbers {
  const { sessions, attempts, monday, timeZone } = input;
  const current = weekTotals(sessions, attempts, monday, timeZone);
  const cutoff = lastWeekCutoff(monday, input.now, timeZone);
  const last = weekTotals(before(sessions, (s) => s.startedAt, cutoff), before(attempts, (a) => a.attemptedAt, cutoff), addDays(monday, -7), timeZone);
  const weeks: WeekNumbers[] = weeksEnding(monday, WEEKS_SHOWN).map((m) => ({ monday: m, ...weekTotals(sessions, attempts, m, timeZone).week }));
  const averageMinutes = Math.round(weeks.reduce((sum, w) => sum + w.focusedMinutes, 0) / weeks.length);

  const dated = datedSessions(sessions, attempts, timeZone);
  const days = new Set(current.days.map((d) => d.date));
  const ofWeek = dated.filter((d) => days.has(d.date));

  // Best hours: the sessions of the 8 weeks by the part of the day they started in.
  const first = weeks[0].monday;
  const last8 = dated.filter((d) => d.date >= first && d.date < addDays(monday, 7));
  const hours = HOUR_BLOCKS.map((b) => {
    const own = last8.filter((d) => blockOf(d.session.startedAt, timeZone) === b.id);
    return { block: b.id, sessions: own.length, score: averageScore(own.map((d) => d.score)) };
  });
  let bestBlock: HourBlockId | null = null;
  let bestScore = -1;
  for (const h of hours) {
    if (h.sessions >= 2 && h.score !== null && h.score > bestScore) {
      bestScore = h.score;
      bestBlock = h.block;
    }
  }

  // Best of the week: the earliest wins a tie.
  let longest: FocusNumbers["longest"] = null;
  let best: FocusNumbers["bestScore"] = null;
  for (const d of ofWeek) {
    if (longest === null || d.session.focusedMinutes > longest.minutes) {
      longest = { minutes: d.session.focusedMinutes, date: d.date, goal: d.session.goalTitle };
    }
    if (best === null || d.score > best.score) best = { score: d.score, date: d.date };
  }
  let bestDay: FocusNumbers["bestDay"] = null;
  for (const day of current.days) {
    if (day.sessions > 0 && (bestDay === null || day.focusedMinutes > bestDay.minutes)) {
      bestDay = { date: day.date, minutes: day.focusedMinutes, sessions: day.sessions };
    }
  }

  // Weekdays: the 4 weeks ending with the shown week.
  const fourStart = addDays(monday, -21);
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  let weekdaySessions = 0;
  for (const d of dated) {
    if (d.date < fourStart || d.date >= addDays(monday, 7)) continue;
    weekdays[daysBetween(mondayOf(d.date), d.date)] += 1;
    weekdaySessions += 1;
  }

  return {
    week: current.week,
    lastWeek: last.week,
    days: current.days,
    weeks,
    averageMinutes,
    finishedAsPlanned: ofWeek.filter((d) => d.session.focusedMinutes >= d.session.plannedMinutes).length,
    activeDays: current.days.filter((d) => d.sessions > 0).length,
    hours,
    bestBlock,
    longest,
    bestScore: best,
    bestDay,
    weekdays,
    weekdaySessions,
    heat: heatOf(dated, monday),
  };
}

/** Focused minutes per day for the 84 days ending with the Sunday of the week of `monday`. */
function heatOf(dated: Dated[], monday: LocalDate): FocusNumbers["heat"] {
  const minutes = new Map<LocalDate, number>();
  for (const d of dated) minutes.set(d.date, (minutes.get(d.date) ?? 0) + d.session.focusedMinutes);
  const start = addDays(monday, 7 - HEAT_DAYS);
  return Array.from({ length: HEAT_DAYS }, (_, i) => {
    const date = addDays(start, i);
    const m = minutes.get(date) ?? 0;
    return { date, minutes: m, level: heatLevel(m) };
  });
}

// ---- Goals ----

type GoalWeek = WeekStatus | "before" | "after";

/** How a goal's week is judged (R8, R9, as the Goals page does); "before"/"after": not judged (not created yet, or past the deadline's week). */
function goalWeek(goal: ReportGoal, doneByWeek: Map<LocalDate, DoneEvent[]>, monday: LocalDate, now: Date, timeZone: string): GoalWeek {
  const creationMonday = mondayOf(localDateOf(goal.createdAt, timeZone));
  if (monday < creationMonday) return "before";
  const lastMonday = goal.deadline === null ? mondayOf(localDateOf(now, timeZone)) : mondayOf(goal.deadline);
  if (monday > lastMonday) return "after";
  const week = { ended: now >= startOfLocalDate(addDays(monday, 7), timeZone), isCreationWeek: monday === creationMonday };
  const statuses = goal.rules.map((rule) => ruleStatus(rule, ruleAmount(rule, doneByWeek.get(monday) ?? []), week));
  if (statuses.includes("missed")) return "missed";
  return statuses.length > 0 && statuses.every((s) => s === "met") ? "met" : "open";
}

function doneEventsByWeek(goalId: string, events: ReportEvent[], timeZone: string): Map<LocalDate, DoneEvent[]> {
  const byWeek = new Map<LocalDate, DoneEvent[]>();
  for (const e of events) {
    if (e.status !== "done" || e.goalId !== goalId) continue;
    const monday = mondayOf(localDateOf(e.startAt, timeZone));
    byWeek.set(monday, [...(byWeek.get(monday) ?? []), { startAt: e.startAt, endAt: e.endAt }]);
  }
  return byWeek;
}

const refOf = (goal: ReportGoal): GoalRef => ({ id: goal.id, title: goal.title, color: goal.color, icon: goal.icon });

/** "3.5" for 3.5: hours rounded down to a tenth, so progress is never overstated. */
const hoursDone = (minutes: number) => Math.floor((minutes / 60) * 10 + 1e-9) / 10;

/**
 * Weeks in a row, counting back from the shown week (at most 12 weeks): `kind` "met" counts weeks
 * that were met and stops at a missed one; "missed" counts missed weeks and stops at a met one. An
 * open week (still running, or the week of creation) neither counts nor breaks. Weeks past the
 * deadline's week count nothing and break nothing; the week before creation ends the row.
 */
function rowOf(goal: ReportGoal, events: ReportEvent[], monday: LocalDate, now: Date, timeZone: string, kind: "met" | "missed"): number {
  const byWeek = doneEventsByWeek(goal.id, events, timeZone);
  let count = 0;
  for (let i = 0; i < GOAL_HISTORY_WEEKS; i++) {
    const status = goalWeek(goal, byWeek, addDays(monday, -7 * i), now, timeZone);
    if (status === "before") break;
    if (status === "after" || status === "open") continue;
    if (status === kind) count += 1;
    else break;
  }
  return count;
}

export function goalsNumbers(input: Pick<ReportInput, "events" | "goals" | "now" | "monday" | "timeZone">): GoalsNumbers {
  const { events, goals, now, monday, timeZone } = input;
  const today = localDateOf(now, timeZone);
  const withRules = goals.filter((g) => g.rules.length > 0);
  const weekEnded = now >= startOfLocalDate(addDays(monday, 7), timeZone);

  const list: GoalNumbers[] = [];
  for (const goal of withRules) {
    const byWeek = doneEventsByWeek(goal.id, events, timeZone);
    const status = goalWeek(goal, byWeek, monday, now, timeZone);
    if (status === "before" || status === "after") continue;
    const creationWeek = monday === mondayOf(localDateOf(goal.createdAt, timeZone));
    const rules: RuleNumbers[] = goal.rules.map((rule) => {
      const amount = ruleAmount(rule, byWeek.get(monday) ?? []);
      return {
        unit: rule.kind === "hours" ? "hours" : "sessions",
        done: rule.kind === "hours" ? hoursDone(amount) : amount,
        target: rule.target,
        status: ruleStatus(rule, amount, { ended: weekEnded, isCreationWeek: creationWeek }),
      };
    });
    list.push({
      goal: refOf(goal),
      rules,
      status,
      weeksInRow: rowOf(goal, events, monday, now, timeZone, "met"),
      deadline: goal.deadline,
      daysLeft: goal.deadline === null ? null : daysBetween(today, goal.deadline),
    });
  }

  const lastWeeks = weeksEnding(monday, 4).map((m) => {
    let reached = 0;
    let judged = 0;
    for (const goal of withRules) {
      const status = goalWeek(goal, doneEventsByWeek(goal.id, events, timeZone), m, now, timeZone);
      if (status === "before" || status === "after") continue;
      judged += 1;
      if (status === "met") reached += 1;
    }
    return { monday: m, reached, judged };
  });

  // Plan: the timed events of a goal that start in the shown week.
  const refs = new Map(goals.map((g) => [g.id, refOf(g)]));
  const dates = weekDates(monday);
  const plan = dates.map((date) => ({ date, items: [] as PlanItem[] }));
  const slipped: GoalsNumbers["slipped"] = [];
  const planned = events
    .filter((e) => e.goalId !== null && refs.has(e.goalId) && dates.includes(localDateOf(e.startAt, timeZone)))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id));
  for (const e of planned) {
    const goal = refs.get(e.goalId!)!;
    const state: PlanItem["state"] = e.status === "done" ? "done" : e.endAt <= now ? "not_done" : "planned";
    plan[dates.indexOf(localDateOf(e.startAt, timeZone))].items.push({ eventId: e.id, title: e.title, goal, state });
    if (state === "not_done") slipped.push({ eventId: e.id, title: e.title, goal, startAt: e.startAt.toISOString(), minutes: minutesOfRange(e.startAt, e.endAt) });
  }

  return {
    list,
    reached: list.filter((g) => g.status === "met").length,
    judged: list.length,
    lastWeeks,
    plan,
    planDone: planned.filter((e) => e.status === "done").length,
    planTotal: planned.length,
    slipped: slipped.slice(0, 5),
  };
}

/** Per goal: how many weeks in a row (ending with the shown week) it was missed. Used by the insights only. */
export function notMetWeeks(input: Pick<ReportInput, "events" | "goals" | "now" | "monday" | "timeZone">): Record<string, number> {
  const result: Record<string, number> = {};
  for (const goal of input.goals) {
    if (goal.rules.length === 0) continue;
    result[goal.id] = rowOf(goal, input.events, input.monday, input.now, input.timeZone, "missed");
  }
  return result;
}

// ---- Time ----

/** Done minutes of the events of one week, by goal ("No goal" = null, also for a goal that no longer exists). */
function doneMinutesByGoal(events: ReportEvent[], goals: ReportGoal[], monday: LocalDate, timeZone: string) {
  const known = new Set(goals.map((g) => g.id));
  const dates = weekDates(monday);
  const days = dates.map((date) => ({ date, minutes: 0, events: 0, byGoal: new Map<string | null, number>() }));
  for (const e of events) {
    if (e.status !== "done") continue;
    const index = dates.indexOf(localDateOf(e.startAt, timeZone));
    if (index < 0) continue;
    const minutes = minutesOfRange(e.startAt, e.endAt);
    const key = e.goalId !== null && known.has(e.goalId) ? e.goalId : null;
    const day = days[index];
    day.minutes += minutes;
    day.events += 1;
    day.byGoal.set(key, (day.byGoal.get(key) ?? 0) + minutes);
  }
  return days;
}

/** Done minutes against the minutes of all timed events of the week that have ended (a done event counts as ended). */
function planKept(events: ReportEvent[], monday: LocalDate, now: Date, timeZone: string) {
  const dates = weekDates(monday);
  let done = 0;
  let ended = 0;
  for (const e of events) {
    if (!dates.includes(localDateOf(e.startAt, timeZone))) continue;
    if (e.status !== "done" && e.endAt > now) continue;
    const minutes = minutesOfRange(e.startAt, e.endAt);
    ended += minutes;
    if (e.status === "done") done += minutes;
  }
  return { ended, kept: ended === 0 ? null : Math.round((100 * done) / ended) };
}

export function timeNumbers(input: Pick<ReportInput, "events" | "goals" | "now" | "monday" | "timeZone">): TimeNumbers {
  const { events, goals, now, monday, timeZone } = input;
  const days = doneMinutesByGoal(events, goals, monday, timeZone);
  const cutoff = lastWeekCutoff(monday, now, timeZone);
  const lastEvents = before(events, (e) => e.startAt, cutoff);
  const lastDays = doneMinutesByGoal(lastEvents, goals, addDays(monday, -7), timeZone);

  const total = (list: typeof days, goalId: string | null | "all") =>
    list.reduce((sum, d) => sum + (goalId === "all" ? d.minutes : (d.byGoal.get(goalId) ?? 0)), 0);
  const doneMinutes = total(days, "all");
  const goalMinutes = doneMinutes - total(days, null);

  const keys = new Set<string | null>([...days, ...lastDays].flatMap((d) => [...d.byGoal.keys()]));
  const refs = new Map(goals.map((g) => [g.id, refOf(g)]));
  const areas = [...keys]
    .map((key) => ({ goal: key === null ? null : refs.get(key)!, minutes: total(days, key), lastWeekMinutes: total(lastDays, key) }))
    .filter((a) => a.minutes > 0 || a.lastWeekMinutes > 0)
    .sort((a, b) => b.minutes - a.minutes || b.lastWeekMinutes - a.lastWeekMinutes || (a.goal?.title ?? "￿").localeCompare(b.goal?.title ?? "￿"));

  let busiest: TimeNumbers["busiest"] = null;
  for (const d of days) {
    if (d.minutes > 0 && (busiest === null || d.minutes > busiest.minutes)) busiest = { date: d.date, minutes: d.minutes, events: d.events };
  }
  let quietest: TimeNumbers["quietest"] = null;
  if (busiest !== null) {
    for (const d of days) if (quietest === null || d.minutes < quietest.minutes) quietest = { date: d.date, minutes: d.minutes };
  }

  const kept = planKept(events, monday, now, timeZone);
  return {
    days: days.map((d) => ({
      date: d.date,
      minutes: d.minutes,
      parts: [...d.byGoal]
        .map(([goalId, minutes]) => ({ goalId, minutes }))
        .sort((a, b) => b.minutes - a.minutes || (a.goalId ?? "￿").localeCompare(b.goalId ?? "￿")),
    })),
    areas,
    doneMinutes,
    lastWeekDoneMinutes: total(lastDays, "all"),
    goalMinutes,
    busiest,
    quietest,
    endedMinutes: kept.ended,
    planKept: kept.kept,
    planKeptLastWeek: planKept(lastEvents, addDays(monday, -7), cutoff ?? now, timeZone).kept,
  };
}

// ---- Streak ----

/**
 * Days in a row with a finished session or a done event of a goal. Counted back from today (or
 * yesterday while today has nothing yet); for an earlier week from its Sunday. Both numbers are
 * limited to the 84 days ending with the shown week's Sunday.
 */
export function streakNumbers(input: Pick<ReportInput, "sessions" | "events" | "goals" | "now" | "monday" | "timeZone">): StreakNumbers {
  const { sessions, events, goals, now, monday, timeZone } = input;
  const known = new Set(goals.map((g) => g.id));
  const active = new Set<LocalDate>();
  for (const s of sessions) active.add(localDateOf(s.startedAt, timeZone));
  for (const e of events) if (e.status === "done" && e.goalId !== null && known.has(e.goalId)) active.add(localDateOf(e.startAt, timeZone));

  const sunday = addDays(monday, 6);
  const first = addDays(monday, 7 - HEAT_DAYS);
  const today = localDateOf(now, timeZone);
  let end = sunday < today ? sunday : today;
  // Today may still have something to come: the streak then ends yesterday.
  if (end === today && !active.has(today)) end = addDays(today, -1);

  let current = 0;
  for (let day = end; day >= first && active.has(day); day = addDays(day, -1)) current += 1;

  let record = 0;
  let run = 0;
  for (let day = first; day <= sunday; day = addDays(day, 1)) {
    run = active.has(day) ? run + 1 : 0;
    record = Math.max(record, run);
  }
  return { current, record: Math.max(record, current) };
}

// ---- Distractions ----

export function blockedNumbers(input: Pick<ReportInput, "sessions" | "attempts" | "monday" | "timeZone"> & { now?: Date }): BlockedNumbers {
  const { sessions, attempts, monday, timeZone } = input;
  const current = weekTotals(sessions, attempts, monday, timeZone);
  const cutoff = lastWeekCutoff(monday, input.now, timeZone);
  const last = weekTotals(before(sessions, (s) => s.startedAt, cutoff), before(attempts, (a) => a.attemptedAt, cutoff), addDays(monday, -7), timeZone);
  const days = new Set(current.days.map((d) => d.date));
  const ofWeek = datedSessions(sessions, attempts, timeZone).filter((d) => days.has(d.date));
  const during = ofWeek.map((d) => attemptsDuring(d.session, attempts));
  const sessionsClean = during.map((n) => n === 0);

  const counts = HOUR_BLOCKS.map((b) => ({ block: b.id, count: 0 }));
  for (const a of attempts) {
    if (!days.has(localDateOf(a.attemptedAt, timeZone))) continue;
    counts.find((c) => c.block === blockOf(a.attemptedAt, timeZone))!.count += 1;
  }
  let worstBlock: HourBlockId | null = null;
  let most = 0;
  for (const c of counts) {
    if (c.count > most) {
      most = c.count;
      worstBlock = c.block;
    }
  }

  return {
    week: current.week.attempts,
    lastWeek: last.week.attempts,
    perSession: ofWeek.length === 0 ? null : Math.round((10 * during.reduce((sum, n) => sum + n, 0)) / ofWeek.length) / 10,
    sessionsClean,
    cleanSessions: sessionsClean.filter(Boolean).length,
    hours: counts,
    worstBlock,
    topSites: current.topSites,
  };
}

// ---- Everything together ----

/** All numbers of the report except the sentences (src/lib/analytics/insights.ts adds those). */
export function buildReport(input: ReportInput): ReportParts {
  const { now, monday, timeZone } = input;
  const today = localDateOf(now, timeZone);
  const thisWeek = mondayOf(today);
  return {
    timeZone,
    monday,
    previous: addDays(monday, -7),
    next: addDays(monday, 7),
    thisWeek,
    today: weekDates(monday).includes(today) ? today : null,
    isCurrentWeek: monday >= thisWeek,
    focus: focusNumbers(input),
    goals: goalsNumbers(input),
    time: timeNumbers(input),
    streaks: streakNumbers(input),
    blocked: blockedNumbers(input),
  };
}
