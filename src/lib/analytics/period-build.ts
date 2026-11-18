// The numbers of a report over several weeks (spec 49, "Export"), added up from the same plain inputs
// and with the same functions as the Analytics page, so a report can never disagree with the page.
// Pure: no database, no React.
import { minutesText } from "@/lib/focus/session-time";
import { addDays, localDateOf, mondayOf, type LocalDate } from "@/lib/time/zoned";
import { lastDayOf, type Period, type PeriodGoal, type PeriodReport, type PeriodWeek } from "./period";
import { blockOf, daysBetween, goalsNumbers, type ReportEvent, type ReportGoal, type ReportSession } from "./report";
import { HOUR_BLOCKS, type GoalRef, type HourBlockId } from "./report-types";
import { attemptsDuring, averageScore, sessionScore, type Attempt } from "./score";

export type PeriodInput = {
  /** Finished sessions from the first week before the period (as many weeks before as the period has) to its end. */
  sessions: ReportSession[];
  /** Blocked visits of the same days, and those just after that lie inside one of the sessions. */
  attempts: Attempt[];
  /** Timed events that start in the period. */
  events: ReportEvent[];
  goals: ReportGoal[];
  now: Date;
  timeZone: string;
  period: Period;
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MINUTE = 60_000;
const minutesOfRange = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / MINUTE);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const percent = (now: number, before: number) => Math.round((100 * (now - before)) / before);

/** 0 for Monday to 6 for Sunday. */
function weekdayOf(date: LocalDate): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** How many of the last entries rise strictly, counted from the end (1 when the last is not above the one before). */
function risingRun(values: number[]): number {
  let run = 1;
  for (let i = values.length - 1; i > 0 && values[i] > values[i - 1]; i--) run += 1;
  return run;
}

export function buildPeriod(input: PeriodInput): PeriodReport {
  const { sessions, attempts, events, goals, now, timeZone, period } = input;
  const mondays = Array.from({ length: period.weeks }, (_, i) => addDays(period.from, 7 * i));
  const inPeriod = new Set(mondays);
  const beforeFrom = addDays(period.from, -7 * period.weeks);

  // Every session with its week, day and score (R19), worked out once.
  const dated = sessions
    .map((session) => {
      const date = localDateOf(session.startedAt, timeZone);
      return { session, date, monday: mondayOf(date), score: sessionScore(session, attemptsDuring(session, attempts)) };
    })
    .sort((a, b) => a.session.startedAt.getTime() - b.session.startedAt.getTime());
  const own = dated.filter((d) => inPeriod.has(d.monday));
  const before = dated.filter((d) => d.monday >= beforeFrom && d.monday < period.from);

  const attemptWeeks = attempts.map((a) => ({ attempt: a, monday: mondayOf(localDateOf(a.attemptedAt, timeZone)) }));
  const ownAttempts = attemptWeeks.filter((a) => inPeriod.has(a.monday));

  const done = events
    .filter((e) => e.status === "done")
    .map((e) => ({ event: e, monday: mondayOf(localDateOf(e.startAt, timeZone)), minutes: minutesOfRange(e.startAt, e.endAt) }))
    .filter((e) => inPeriod.has(e.monday));

  // The goals week by week, judged exactly as the page judges them.
  const goalWeeks = mondays.map((monday) => goalsNumbers({ events, goals, now, monday, timeZone }));

  const weeks: PeriodWeek[] = mondays.map((monday, i) => {
    const mine = own.filter((d) => d.monday === monday);
    const focusedMinutes = mine.reduce((sum, d) => sum + d.session.focusedMinutes, 0);
    return {
      monday,
      focusedMinutes,
      sessions: mine.length,
      averageSessionMinutes: mine.length === 0 ? null : Math.round(focusedMinutes / mine.length),
      score: averageScore(mine.map((d) => d.score)),
      attempts: ownAttempts.filter((a) => a.monday === monday).length,
      doneMinutes: done.filter((e) => e.monday === monday).reduce((sum, e) => sum + e.minutes, 0),
      goalsReached: goalWeeks[i].reached,
      goalsJudged: goalWeeks[i].judged,
    };
  });

  const focusedMinutes = weeks.reduce((sum, w) => sum + w.focusedMinutes, 0);
  const doneMinutes = weeks.reduce((sum, w) => sum + w.doneMinutes, 0);
  const goalIds = new Set(goals.map((g) => g.id));
  const refs = new Map<string, GoalRef>(goals.map((g) => [g.id, { id: g.id, title: g.title, color: g.color, icon: g.icon }]));

  // Goals with rules that were judged in at least one week of the period.
  const periodGoals: PeriodGoal[] = [];
  for (const goal of goals) {
    if (goal.rules.length === 0) continue;
    const perWeek = mondays.map((monday, i) => {
      const numbers = goalWeeks[i].list.find((g) => g.goal.id === goal.id);
      if (!numbers) return { monday, text: null, status: null };
      const rule = numbers.rules[0];
      return { monday, text: rule.unit === "hours" ? `${rule.done} of ${rule.target} h` : `${rule.done} of ${rule.target}`, status: numbers.status };
    });
    const judged = perWeek.filter((w) => w.status !== null);
    if (judged.length === 0) continue;
    periodGoals.push({ goal: refs.get(goal.id)!, weeks: perWeek, metWeeks: judged.filter((w) => w.status === "met").length, judgedWeeks: judged.length });
  }

  // Where the time went: done minutes per goal; a deleted goal counts as "No goal".
  const perGoal = new Map<string, number>();
  for (const { event, minutes } of done) {
    const key = event.goalId !== null && goalIds.has(event.goalId) ? event.goalId : "";
    perGoal.set(key, (perGoal.get(key) ?? 0) + minutes);
  }
  const areas = [...perGoal]
    .filter(([, minutes]) => minutes > 0)
    .map(([id, minutes]) => ({ goal: id === "" ? null : refs.get(id)!, minutes }))
    .sort((a, b) => b.minutes - a.minutes || (a.goal?.title ?? "~").localeCompare(b.goal?.title ?? "~"));

  const weekdays = Array.from({ length: 7 }, () => 0);
  for (const d of own) weekdays[weekdayOf(d.date)] += 1;

  const hours = HOUR_BLOCKS.map((block) => {
    const scores = own.filter((d) => blockOf(d.session.startedAt, timeZone) === block.id).map((d) => d.score);
    return { block: block.id, sessions: scores.length, score: averageScore(scores) };
  });
  const rated = hours.filter((h) => h.sessions >= 2 && h.score !== null);
  const bestBlock: HourBlockId | null = rated.length === 0 ? null : rated.reduce((best, h) => (h.score! > best.score! ? h : best)).block;

  const longestOne = own.reduce<(typeof own)[number] | null>((best, d) => (best === null || d.session.focusedMinutes > best.session.focusedMinutes ? d : best), null);

  const siteCounts = new Map<string, number>();
  for (const { attempt } of ownAttempts) siteCounts.set(attempt.domain, (siteCounts.get(attempt.domain) ?? 0) + 1);
  const topSites = [...siteCounts]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, 5);

  // The same number of weeks right before the period, for the comparison.
  const beforeAttempts = attemptWeeks.filter((a) => a.monday >= beforeFrom && a.monday < period.from).length;
  // Days of the period that have begun: a report that ends in the current week stops at today.
  const today = localDateOf(now, timeZone);
  const lastDay = lastDayOf(period);
  const days = daysBetween(period.from, lastDay < today ? lastDay : today) + 1;

  const report: Omit<PeriodReport, "insights"> = {
    period,
    createdOn: localDateOf(now, timeZone),
    empty: own.length === 0 && done.length === 0 && ownAttempts.length === 0,
    weeks,
    totals: {
      focusedMinutes,
      sessions: own.length,
      averageSessionMinutes: own.length === 0 ? null : Math.round(focusedMinutes / own.length),
      score: averageScore(own.map((d) => d.score)),
      attempts: ownAttempts.length,
      doneMinutes,
      goalMinutes: areas.filter((a) => a.goal !== null).reduce((sum, a) => sum + a.minutes, 0),
      activeDays: new Set(own.map((d) => d.date)).size,
      days,
    },
    before: { focusedMinutes: before.reduce((sum, d) => sum + d.session.focusedMinutes, 0), attempts: beforeAttempts },
    goals: periodGoals,
    goalWeeksMet: periodGoals.reduce((sum, g) => sum + g.metWeeks, 0),
    goalWeeksJudged: periodGoals.reduce((sum, g) => sum + g.judgedWeeks, 0),
    areas,
    weekdays,
    hours,
    bestBlock,
    longest: longestOne ? { minutes: longestOne.session.focusedMinutes, date: longestOne.date, goal: longestOne.session.goalTitle } : null,
    topSites,
  };
  return { ...report, insights: periodInsights(report) };
}

/**
 * What went well and what did not over the period, by fixed rules (no AI). Each rule speaks only when
 * its numbers exist; at most three sentences per list.
 */
export function periodInsights(report: Omit<PeriodReport, "insights">): PeriodReport["insights"] {
  const { weeks, totals, period, before } = report;
  const count = plural(period.weeks, "week");
  if (report.empty) return { good: [], bad: [], summary: "Nothing was recorded in this period." };

  const good: string[] = [];
  const bad: string[] = [];
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const scored = weeks.filter((w) => w.score !== null);
  const firstScore = scored.length > 1 ? scored[0].score! : null;
  const lastScore = scored.length > 1 ? scored[scored.length - 1].score! : null;
  const growth = before.focusedMinutes > 0 ? percent(totals.focusedMinutes, before.focusedMinutes) : null;

  // Focus time.
  const rising = risingRun(weeks.map((w) => w.focusedMinutes));
  if (rising >= 3) {
    good.push(`Focus time grew ${rising} weeks in a row: ${weeks.slice(-Math.min(rising, 4)).map((w) => minutesText(w.focusedMinutes)).join(", ")}.`);
  } else if (growth !== null && growth > 0) {
    good.push(`${growth}% more focus time than in the ${count} before.`);
  }
  if (growth !== null && growth < 0) bad.push(`${-growth}% less focus time than in the ${count} before.`);

  // Focus score.
  if (firstScore !== null && lastScore !== null && lastScore - firstScore >= 5) good.push(`Your focus score rose from ${firstScore} to ${lastScore}.`);
  if (firstScore !== null && lastScore !== null && firstScore - lastScore >= 5) bad.push(`Your focus score fell from ${firstScore} to ${lastScore}.`);

  // Goals: the best and the weakest one.
  const judged = report.goals.filter((g) => g.judgedWeeks >= 2);
  const always = judged.find((g) => g.metWeeks === g.judgedWeeks);
  if (always) good.push(`${always.goal.title} was reached in all ${always.judgedWeeks} weeks.`);
  const never = judged.find((g) => g.metWeeks === 0 && g.weeks.some((w) => w.status === "missed"));
  if (never) bad.push(`${never.goal.title} was not reached in any of the ${never.judgedWeeks} weeks.`);

  // Blocked visits, first against last week.
  if (period.weeks >= 2 && first.attempts > last.attempts) good.push(`Blocked visits fell from ${first.attempts} to ${last.attempts} a week.`);
  if (period.weeks >= 2 && last.attempts > first.attempts) bad.push(`Blocked visits rose from ${first.attempts} to ${last.attempts} a week.`);

  // Time of day: a part of the day that scores clearly below the best one.
  const best = report.bestBlock ? report.hours.find((h) => h.block === report.bestBlock)! : null;
  if (best) {
    const weak = report.hours.filter((h) => h.sessions >= 2 && h.score !== null && best.score! - h.score >= 15).sort((a, b) => a.score! - b.score!)[0];
    const label = (id: HourBlockId) => HOUR_BLOCKS.find((b) => b.id === id)!.label.toLowerCase();
    if (weak) bad.push(`Sessions that start ${label(weak.block)} score ${weak.score} on average, ${best.score! - weak.score!} below your best hours (${label(best.block)}).`);
  }

  // Weekdays without any session.
  if (period.weeks >= 2 && totals.sessions > 0) {
    const none = WEEKDAYS.filter((_, day) => report.weekdays[day] === 0);
    if (none.length > 0 && none.length <= 3) bad.push(`No focus session on any ${none.join(" or ")}.`);
  }

  // The summary: what was done, how it compares, and the goals.
  const sentences: string[] = [];
  if (totals.sessions === 0) sentences.push(`No focus sessions in ${period.weeks === 1 ? "this week" : `these ${count}`}.`);
  else {
    const compared = growth === null || growth === 0 ? "" : growth > 0 ? `, ${growth}% more than in the ${count} before` : `, ${-growth}% less than in the ${count} before`;
    sentences.push(`You focused ${minutesText(totals.focusedMinutes)} in ${plural(totals.sessions, "session")} over ${count}${compared}.`);
  }
  if (firstScore !== null && lastScore !== null && firstScore !== lastScore) sentences.push(`Your focus score went from ${firstScore} to ${lastScore}.`);
  if (report.goalWeeksJudged > 0) {
    sentences.push(never ? `${never.goal.title} is the goal that keeps slipping.` : `You reached your goals in ${report.goalWeeksMet} of ${report.goalWeeksJudged} goal weeks.`);
  }

  return { good: good.slice(0, 3), bad: bad.slice(0, 3), summary: sentences.join(" ") };
}
