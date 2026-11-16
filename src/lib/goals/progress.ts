// Goal progress (R8, R9). Calculated every time from the goal, its rules and its done events;
// never saved. Pure functions, no database and no React.
//
// R8: only done events of the goal count, for every rule of that goal. With min_minutes only events
// at least that long count; hours adds the lengths. A week is met when the target is reached,
// missed when it ended unmet, otherwise open. The week the goal was created is never missed.
// R9: the strip runs from the week of creation to the week of the deadline; later weeks are not
// judged. A week is met if all rules are met, missed if any is missed, else open.
// R9 for a goal without an end date (spec 41): the strip runs from the week of creation to the current
// week, at most the latest 12 weeks; the countdown says "No end date".
// Weeks run Monday 00:00 to Sunday 24:00 in the user's time zone; an event belongs to the week it starts in (R2).
import { addDays, localDateOf, mondayOf, startOfLocalDate, type LocalDate } from "@/lib/time/zoned";

export type RuleKind = "count" | "hours";
export type WeekStatus = "open" | "met" | "missed";

export type Rule = { id: string; kind: RuleKind; target: number; minMinutes: number | null };
/** A done event of the goal. */
export type DoneEvent = { startAt: Date; endAt: Date };

export type GoalInput = {
  createdAt: Date;
  /** The last day, "2027-03-14", or null: the goal has no end date (spec 41). */
  deadline: LocalDate | null;
  rules: Rule[];
  /** Only the goal's events with status done. */
  doneEvents: DoneEvent[];
};

export type RuleProgress = { ruleId: string; text: string; status: WeekStatus };
export type StripWeek = { monday: LocalDate; status: WeekStatus; isCurrent: boolean };
export type GoalProgress = { thisWeek: RuleProgress[]; weeks: StripWeek[]; countdown: string };

const MINUTE = 60_000;

/** The countdown of a goal without an end date. */
export const NO_END_DATE = "No end date";

/** How many weeks the strip of a goal without an end date shows at most (the latest ones). */
export const OPEN_ENDED_WEEKS = 12;

function minutesOf(event: DoneEvent): number {
  return Math.round((event.endAt.getTime() - event.startAt.getTime()) / MINUTE);
}

/** How far a rule got in a week: events that count (count rules) or minutes (hours rules). */
export function ruleAmount(rule: Rule, eventsOfWeek: DoneEvent[]): number {
  if (rule.kind === "hours") return eventsOfWeek.reduce((sum, e) => sum + minutesOf(e), 0);
  return eventsOfWeek.filter((e) => rule.minMinutes === null || minutesOf(e) >= rule.minMinutes).length;
}

function reached(rule: Rule, amount: number): boolean {
  return rule.kind === "hours" ? amount >= rule.target * 60 : amount >= rule.target;
}

/** The status of one rule in one week. */
export function ruleStatus(rule: Rule, amount: number, week: { ended: boolean; isCreationWeek: boolean }): WeekStatus {
  if (reached(rule, amount)) return "met";
  if (week.ended && !week.isCreationWeek) return "missed";
  return "open";
}

/** "3.5" for 3.5, "2" for 2.0; rounded down to a tenth, so progress is never overstated. */
function hoursText(hours: number): string {
  return String(Math.floor(hours * 10 + 1e-9) / 10);
}

/** "This week: 1 of 2 done" or "This week: 3.5 of 6 h" (R9). */
export function ruleText(rule: Rule, amount: number): string {
  if (rule.kind === "hours") return `This week: ${hoursText(amount / 60)} of ${hoursText(rule.target)} h`;
  return `This week: ${amount} of ${rule.target} done`;
}

/** "12 days left", "1 day left", "Due today" or "Deadline passed". */
export function countdownText(deadline: LocalDate, today: LocalDate): string {
  const days = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (24 * 60 * MINUTE));
  if (days < 0) return "Deadline passed";
  if (days === 0) return "Due today";
  return days === 1 ? "1 day left" : `${days} days left`;
}

/** The goal's progress as the panel shows it, at `now` in `timeZone`. */
export function goalProgress(goal: GoalInput, now: Date, timeZone: string): GoalProgress {
  const today = localDateOf(now, timeZone);
  const creationMonday = mondayOf(localDateOf(goal.createdAt, timeZone));
  const currentMonday = mondayOf(today);
  // Without an end date: up to the current week, and only the latest 12 weeks.
  const lastMonday = goal.deadline === null ? currentMonday : mondayOf(goal.deadline);
  const latestFirst = addDays(currentMonday, -7 * (OPEN_ENDED_WEEKS - 1));
  const firstMonday = goal.deadline === null && creationMonday < latestFirst ? latestFirst : creationMonday;

  // Done events grouped by the Monday of the week they start in.
  const byWeek = new Map<LocalDate, DoneEvent[]>();
  for (const event of goal.doneEvents) {
    const monday = mondayOf(localDateOf(event.startAt, timeZone));
    byWeek.set(monday, [...(byWeek.get(monday) ?? []), event]);
  }

  const weekStatus = (monday: LocalDate): WeekStatus => {
    const week = { ended: now >= startOfLocalDate(addDays(monday, 7), timeZone), isCreationWeek: monday === creationMonday };
    const statuses = goal.rules.map((rule) => ruleStatus(rule, ruleAmount(rule, byWeek.get(monday) ?? []), week));
    if (statuses.includes("missed")) return "missed";
    return statuses.length > 0 && statuses.every((s) => s === "met") ? "met" : "open";
  };

  const weeks: StripWeek[] = [];
  for (let monday = firstMonday; monday <= lastMonday; monday = addDays(monday, 7)) {
    weeks.push({ monday, status: weekStatus(monday), isCurrent: monday === currentMonday });
  }

  const thisWeekEvents = byWeek.get(currentMonday) ?? [];
  return {
    thisWeek: goal.rules.map((rule) => {
      const amount = ruleAmount(rule, thisWeekEvents);
      return {
        ruleId: rule.id,
        text: ruleText(rule, amount),
        // The current week has not ended yet, so it is met or open, never missed.
        status: ruleStatus(rule, amount, { ended: false, isCreationWeek: currentMonday === creationMonday }),
      };
    }),
    weeks,
    countdown: goal.deadline === null ? NO_END_DATE : countdownText(goal.deadline, today),
  };
}
