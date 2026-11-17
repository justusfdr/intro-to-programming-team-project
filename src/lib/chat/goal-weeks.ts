// Spec 43 (R45): how many sessions of a goal are still left to plan, for the current week and the next
// one (Monday to Sunday in the person's time zone, R2). Worked out by our server, never by Claude, like
// R31's totals. Pure: no database, no clock of its own.
// Per rule:
// - `count`: the target minus the goal's done events of that week minus its events still planned in
//   that week (timed, not done, from the start of today on); with `min_minutes` only events at least
//   that long count (R8).
// - `hours`: the target in minutes minus the minutes done minus the minutes planned, divided by the
//   session length (60 when the goal has none), rounded up.
// The goal's `left` is the largest of its rules' values, never below 0. A week that starts after the
// goal's deadline is not listed; a goal without an end date has no such limit.
import { addDays, localDateOf, mondayOf, startOfLocalDate, type LocalDate } from "@/lib/time/zoned";

/** A session lasts this long when the goal does not say (spec 43). */
export const DEFAULT_SESSION_MINUTES = 60;

/** How many weeks are listed: the current one and the next. */
export const PLAN_WEEKS = 2;

export type WeekRule = { kind: "count" | "hours"; target: number; minMinutes: number | null };

/** A timed event of a goal: done ones come from R31's read, planned ones from the calendar read. */
export type GoalEvent = { goalId: string | null; startAt: Date; endAt: Date };

export type WeekLeft = { from: LocalDate; to: LocalDate; left: number };

export type GoalWeeksInput = {
  goal: { id: string; deadline: string | null; rules: readonly WeekRule[]; sessionMinutes: number | null };
  /** Done timed events (of any goal; only this goal's count). */
  done: readonly GoalEvent[];
  /** Timed events that are not done (of any goal; only this goal's from the start of today on count). */
  planned: readonly GoalEvent[];
  now: Date;
  timeZone: string;
};

const minutesOf = (e: GoalEvent) => Math.round((e.endAt.getTime() - e.startAt.getTime()) / 60000);

/** The sessions left for one rule in one week, before the floor at 0. */
function ruleLeft(rule: WeekRule, events: readonly GoalEvent[], sessionMinutes: number): number {
  const counted = rule.minMinutes === null ? events : events.filter((e) => minutesOf(e) >= rule.minMinutes!);
  if (rule.kind === "count") return rule.target - counted.length;
  const minutes = rule.target * 60 - counted.reduce((sum, e) => sum + minutesOf(e), 0);
  return Math.ceil(minutes / sessionMinutes);
}

export function goalWeeks(input: GoalWeeksInput): WeekLeft[] {
  const { goal, now, timeZone } = input;
  const today = localDateOf(now, timeZone);
  const startOfToday = startOfLocalDate(today, timeZone);
  const sessionMinutes = goal.sessionMinutes ?? DEFAULT_SESSION_MINUTES;
  const weekOf = (e: GoalEvent) => mondayOf(localDateOf(e.startAt, timeZone));
  const own = (e: GoalEvent) => e.goalId === goal.id;
  const done = input.done.filter(own);
  const planned = input.planned.filter((e) => own(e) && e.startAt >= startOfToday);

  const weeks: WeekLeft[] = [];
  for (let i = 0; i < PLAN_WEEKS; i++) {
    const monday = addDays(mondayOf(today), 7 * i);
    if (goal.deadline !== null && monday > goal.deadline) break;
    const events = [...done, ...planned].filter((e) => weekOf(e) === monday);
    const left = goal.rules.reduce((most, rule) => Math.max(most, ruleLeft(rule, events, sessionMinutes)), 0);
    weeks.push({ from: monday, to: addDays(monday, 6), left });
  }
  return weeks;
}
