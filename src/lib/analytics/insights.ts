// "What goes well, what does not" (spec 49): short sentences built from the report's numbers by fixed
// rules. No AI, nothing leaves the server. A rule only speaks when its numbers exist; the rules of a
// topic are listed from the strongest to the weakest, and at most three of each kind are kept.
import { minutesText } from "@/lib/focus/session-time";
import { HOUR_BLOCKS, TOPICS, type AnalyticsReport, type HourBlockId, type Insights, type Topic } from "./report-types";

type ReportWithoutInsights = Omit<AnalyticsReport, "insights" | "summary">;

/** More facts the report itself does not carry. Without them the rule that needs them stays silent. */
export type InsightExtras = {
  /** Goal id -> weeks in a row the goal was missed, ending with the shown week (notMetWeeks in report.ts). */
  notMetWeeks?: Record<string, number>;
};

const MAX_PER_KIND = 3;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Rules = { good: (string | null)[]; bad: (string | null)[]; empty: string; neutral: string };

const labelOf = (block: HourBlockId) => HOUR_BLOCKS.find((b) => b.id === block)!.label;
/** Issue #126: a running week is compared with last week up to the same moment (report.ts). */
const lastName = (r: ReportWithoutInsights) => (r.isCurrentWeek ? "this time last week" : "last week");
const percentMore = (now: number, before: number) => Math.round((100 * Math.abs(now - before)) / before);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** "3.5", "2": a number with at most one decimal. */
const tidy = (n: number) => String(Math.round(n * 10) / 10);
const list = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The block's name inside a sentence: "before 9 am", "at 9 – 11 am". */
function whenText(block: HourBlockId): string {
  const text = labelOf(block);
  return block === "early" || block === "late" ? text.charAt(0).toLowerCase() + text.slice(1) : `at ${text}`;
}

const CARRIES: Record<HourBlockId, string> = {
  early: "Early starts carry the week",
  morning: "Mornings carry the week",
  midday: "Midday carries the week",
  afternoon: "Afternoons carry the week",
  late: "Evenings carry the week",
};

// ---- The rules of each topic ----

function focusRules(r: ReportWithoutInsights): Rules {
  const f = r.focus;
  const others = f.weeks.slice(0, -1);
  let grew = 0;
  for (let i = f.weeks.length - 1; i > 0 && f.weeks[i].focusedMinutes > f.weeks[i - 1].focusedMinutes; i--) grew += 1;
  const hours = f.hours.filter((h) => h.sessions >= 2 && h.score !== null);
  const best = f.bestBlock === null ? null : hours.find((h) => h.block === f.bestBlock)!;
  const worst = best === null ? null : [...hours].sort((a, b) => a.score! - b.score!)[0];
  const lightest = f.days.filter((d) => d.sessions > 0).sort((a, b) => a.focusedMinutes - b.focusedMinutes || (a.date < b.date ? -1 : 1))[0];
  const mostMinutes = f.bestDay?.minutes ?? 0;
  const weekdayName = (date: string) => WEEKDAYS[f.days.findIndex((d) => d.date === date)];

  const hasLast = f.lastWeek.focusedMinutes > 0;
  return {
    empty: "No focus sessions this week yet.",
    neutral: `${minutesText(f.week.focusedMinutes)} of focus in ${f.week.sessions} ${plural(f.week.sessions, "session", "sessions")} this week.`,
    good: [
      hasLast && f.week.focusedMinutes > f.lastWeek.focusedMinutes
        ? `${minutesText(f.week.focusedMinutes)} of focus, ${percentMore(f.week.focusedMinutes, f.lastWeek.focusedMinutes)} % more than ${lastName(r)}.`
        : null,
      f.week.focusedMinutes > 0 && others.some((w) => w.focusedMinutes > 0) && others.every((w) => f.week.focusedMinutes > w.focusedMinutes)
        ? `This is your best week of the last 8, with ${minutesText(f.week.focusedMinutes)} of focus.`
        : null,
      grew >= 3 ? `Your focus time grew ${grew} weeks in a row.` : null,
      best !== null ? `${CARRIES[best.block]}: sessions ${whenText(best.block)} score ${best.score} on average.` : null,
      f.activeDays >= 5 ? `You focused on ${f.activeDays} days this week.` : null,
    ],
    bad: [
      hasLast && f.week.focusedMinutes < f.lastWeek.focusedMinutes
        ? `${minutesText(f.week.focusedMinutes)} of focus, ${percentMore(f.week.focusedMinutes, f.lastWeek.focusedMinutes)} % less than ${lastName(r)}.`
        : null,
      f.bestDay !== null && lightest && lightest.date !== f.bestDay.date && lightest.focusedMinutes * 2 < mostMinutes
        ? `${weekdayName(lightest.date)} was your lightest day with ${minutesText(lightest.focusedMinutes)}, under half of ${weekdayName(f.bestDay.date)}.`
        : null,
      best !== null && worst !== null && worst.score! <= best.score! - 15
        ? `Sessions ${whenText(worst.block)} score ${worst.score}, ${best.score! - worst.score!} points below your best hours.`
        : null,
      f.week.sessions > 0 && f.finishedAsPlanned * 2 < f.week.sessions
        ? `Only ${f.finishedAsPlanned} of ${f.week.sessions} ${plural(f.week.sessions, "session", "sessions")} reached the planned length.`
        : null,
    ],
  };
}

/** What a goal still lacks: "1 of 2 sessions done, 1 short". */
function shortText(rules: AnalyticsReport["goals"]["list"][number]["rules"]): string {
  const rule = rules.find((x) => x.status !== "met") ?? rules[0];
  const unit = rule.unit === "hours" ? "h" : plural(rule.target, "session", "sessions");
  const short = Math.round((rule.target - rule.done) * 10) / 10;
  return `${tidy(rule.done)} of ${tidy(rule.target)} ${unit} done, ${tidy(short)} ${rule.unit === "hours" ? "h " : ""}short`;
}

function goalsRules(r: ReportWithoutInsights, extras: InsightExtras): Rules {
  const g = r.goals;
  const previous = g.lastWeeks[g.lastWeeks.length - 2];
  const row = [...g.list].sort((a, b) => b.weeksInRow - a.weeksInRow)[0];
  const fell = g.list.filter((x) => x.status === "missed" || (x.status === "open" && !r.isCurrentWeek));
  const notMet = g.list
    .map((x) => ({ goal: x, weeks: extras.notMetWeeks?.[x.goal.id] ?? 0 }))
    .sort((a, b) => b.weeks - a.weeks)[0];
  const slipped = g.plan.flatMap((d) => d.items).filter((i) => i.state === "not_done").length;
  const due = g.list
    .filter((x) => x.daysLeft !== null && x.daysLeft >= 0 && x.daysLeft <= 14 && x.status !== "met")
    .sort((a, b) => a.daysLeft! - b.daysLeft!)[0];

  return {
    empty: "No goals with a weekly target this week.",
    neutral: `${g.reached} of ${g.judged} ${plural(g.judged, "goal", "goals")} reached this week.`,
    good: [
      g.judged > 0 && g.reached === g.judged ? (g.judged === 1 ? "Your goal is met this week." : `All ${g.judged} goals are met this week.`) : null,
      row && row.weeksInRow >= 2 ? `${row.goal.title} has been met ${row.weeksInRow} weeks in a row.` : null,
      previous && previous.judged > 0 && g.reached > previous.reached
        ? `${g.reached} ${plural(g.reached, "goal", "goals")} reached, up from ${previous.reached} last week.`
        : null,
    ],
    bad: [
      fell.length > 0
        ? `${fell[0].goal.title} fell short: ${shortText(fell[0].rules)}.${fell.length > 1 ? ` ${fell.length - 1} more ${plural(fell.length - 1, "goal", "goals")} fell short as well.` : ""}`
        : null,
      notMet && notMet.weeks >= 2 ? `${notMet.goal.goal.title} has not been met for ${notMet.weeks} weeks.` : null,
      slipped > 0 ? `${slipped} planned ${plural(slipped, "session was", "sessions were")} not done.` : null,
      due ? `${due.goal.title} is due ${due.daysLeft === 0 ? "today" : `in ${due.daysLeft} ${plural(due.daysLeft!, "day", "days")}`} and is not met this week.` : null,
    ],
  };
}

function timeRules(r: ReportWithoutInsights): Rules {
  const t = r.time;
  const share = t.doneMinutes > 0 ? Math.round((100 * t.goalMinutes) / t.doneMinutes) : null;
  const top = t.areas[0];
  const noGoalLargest = top !== undefined && top.goal === null && top.minutes > 0 && (t.areas.length === 1 || top.minutes > t.areas[1].minutes);
  const withTime = new Set(t.areas.filter((a) => a.minutes > 0).map((a) => a.goal?.id));
  const idle = r.goals.list.filter((x) => !withTime.has(x.goal.id)).map((x) => x.goal.title);

  return {
    empty: "No finished events this week yet.",
    neutral: `${minutesText(t.doneMinutes)} done this week.`,
    good: [
      t.lastWeekDoneMinutes > 0 && t.doneMinutes > t.lastWeekDoneMinutes
        ? `You got ${minutesText(t.doneMinutes)} done, ${percentMore(t.doneMinutes, t.lastWeekDoneMinutes)} % more than ${lastName(r)}.`
        : null,
      share !== null && share >= 70 ? `${share} % of your done time went to your goals.` : null,
      t.planKept !== null && t.planKept >= 80 ? `You kept ${t.planKept} % of your plan.` : null,
    ],
    bad: [
      t.planKept !== null && t.planKept < 60 ? `Only ${t.planKept} % of your plan was kept.` : null,
      noGoalLargest && r.goals.list.length > 0 ? `Most of your time, ${minutesText(top.minutes)}, went to events without a goal.` : null,
      idle.length > 0
        ? `No time went to ${list(idle.slice(0, 2))}${idle.length > 2 ? ` and ${idle.length - 2} more` : ""}.`
        : null,
    ],
  };
}

function streakRules(r: ReportWithoutInsights): Rules {
  const s = r.streaks;
  const activeDays = r.focus.heat.filter((d) => d.minutes > 0).length;
  const missing = r.focus.weekdays.flatMap((n, i) => (n === 0 ? [`${WEEKDAYS[i]}s`] : []));
  return {
    empty: "No streak yet. A finished session or a done goal event starts one.",
    neutral: `Your streak is ${s.current} ${plural(s.current, "day", "days")}.`,
    good: [
      s.current >= 3 ? `You are on a ${s.current}-day streak.` : null,
      s.current >= 3 && s.current === s.record ? `That equals your record of ${s.record} days.` : null,
      activeDays >= 60 ? `You focused on ${activeDays} of the last ${r.focus.heat.length} days.` : null,
    ],
    bad: [
      s.current === 0 && s.record > 0 ? `Your streak is at 0 days. Your record is ${s.record} ${plural(s.record, "day", "days")}.` : null,
      r.focus.weekdaySessions > 0 && missing.length > 0 ? `No sessions on ${list(missing)} in the last 4 weeks.` : null,
    ],
  };
}

function blockedRules(r: ReportWithoutInsights): Rules {
  const b = r.blocked;
  const sessions = r.focus.week.sessions;
  const lastHasData = r.focus.lastWeek.sessions > 0 || b.lastWeek > 0;
  const others = r.focus.weeks.slice(0, -1);
  const worstCount = b.hours.find((h) => h.block === b.worstBlock)?.count ?? 0;
  const topSite = b.topSites[0];
  const enough = b.week >= 3;
  return {
    empty: "No sessions and no blocked visits this week yet.",
    neutral: b.week === 0 ? "No blocked visits this week." : `${b.week} blocked ${plural(b.week, "visit", "visits")} this week.`,
    good: [
      b.lastWeek > 0 && b.week < b.lastWeek ? `${b.week} blocked ${plural(b.week, "visit", "visits")}, down from ${b.lastWeek} ${lastName(r)}.` : null,
      others.length > 0 && others.some((w) => w.sessions > 0 || w.attempts > 0) && others.every((w) => b.week < w.attempts)
        ? `${b.week} blocked ${plural(b.week, "visit", "visits")} is your lowest in 8 weeks.`
        : null,
      sessions > 0 && b.cleanSessions * 2 >= sessions ? `${b.cleanSessions} of ${sessions} ${plural(sessions, "session", "sessions")} had no blocked visit.` : null,
    ],
    bad: [
      lastHasData && b.week > b.lastWeek ? `${b.week} blocked ${plural(b.week, "visit", "visits")}, up from ${b.lastWeek} ${lastName(r)}.` : null,
      enough && b.worstBlock !== null && worstCount * 10 >= b.week * 4
        ? `${worstCount} of ${b.week} blocked visits came ${whenText(b.worstBlock)}.`
        : null,
      enough && topSite && topSite.count * 10 >= b.week * 4 ? `${topSite.domain} makes up ${topSite.count} of ${b.week} blocked visits.` : null,
    ],
  };
}

// ---- Putting the sentences together ----

/** True when the week has nothing to say about the topic (so zeros are not shown as bad news). */
function isEmpty(topic: Topic, r: ReportWithoutInsights): boolean {
  switch (topic) {
    case "focus":
      return r.focus.week.sessions === 0;
    case "goals":
      return r.goals.judged === 0;
    case "time":
      return r.time.doneMinutes === 0 && r.time.endedMinutes === 0;
    case "streaks":
      return r.streaks.record === 0;
    case "blocked":
      return r.focus.week.sessions === 0 && r.blocked.week === 0;
  }
}

function insightOf(topic: Topic, r: ReportWithoutInsights, rules: Rules): Insights {
  if (isEmpty(topic, r)) return { good: [], bad: [], summary: rules.empty };
  const good = rules.good.filter((s): s is string => s !== null).slice(0, MAX_PER_KIND);
  const bad = rules.bad.filter((s): s is string => s !== null).slice(0, MAX_PER_KIND);
  const summary = [good[0], bad[0]].filter(Boolean).join(" ");
  return { good, bad, summary: summary === "" ? rules.neutral : summary };
}

/** The sentences of every topic and one summary of the whole week. */
export function insightsOf(report: ReportWithoutInsights, extras: InsightExtras = {}): { insights: Record<Topic, Insights>; summary: string } {
  const rules: Record<Topic, Rules> = {
    focus: focusRules(report),
    goals: goalsRules(report, extras),
    time: timeRules(report),
    streaks: streakRules(report),
    blocked: blockedRules(report),
  };
  const insights = Object.fromEntries(TOPICS.map((topic) => [topic, insightOf(topic, report, rules[topic])])) as Record<Topic, Insights>;
  return { insights, summary: weekSummary(report, insights) };
}

/** One or two sentences for the Overview: how the week went, then what needs attention most. */
function weekSummary(r: ReportWithoutInsights, insights: Record<Topic, Insights>): string {
  const f = r.focus.week;
  const nothing = f.sessions === 0 && r.time.doneMinutes === 0 && r.blocked.week === 0 && r.goals.planTotal === 0;
  if (nothing) return "Nothing tracked this week yet.";

  const goals = r.goals.judged > 0 ? ` and ${r.goals.reached} of ${r.goals.judged} ${plural(r.goals.judged, "goal", "goals")} reached` : "";
  const body = f.sessions > 0 ? `${minutesText(f.focusedMinutes)} of focus in ${f.sessions} ${plural(f.sessions, "session", "sessions")}${goals}` : `no focus sessions${goals}`;

  const good = TOPICS.reduce((n, t) => n + insights[t].good.length, 0);
  const bad = TOPICS.reduce((n, t) => n + insights[t].bad.length, 0);
  const goalsFine = r.goals.judged === 0 || r.goals.reached * 2 >= r.goals.judged;
  const strong = f.sessions > 0 && goalsFine && good >= bad;
  const lead = strong ? "A strong week" : f.sessions === 0 ? "A quiet week" : "A slower week";

  const attention = (["goals", "focus", "time", "streaks", "blocked"] as const).map((t) => insights[t].bad[0]).find(Boolean);
  return `${lead}: ${body}. ${attention ?? "Nothing needs attention right now."}`;
}
