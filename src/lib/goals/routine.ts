// A goal's routine (spec 41, ontology R44): what kind of goal it is, how long one session usually is,
// when in the day it suits, the weekdays it is never done on, the weekdays it always happens on and
// where it is done. All optional; a goal
// without any of it is a goal as before. How often per week stays in the goal's rules (R7).
// Pure: no React, no database. The server checks a routine with routineProblem (and throws the message);
// the screens of spec 42 show the same sentence before sending.
import { MESSAGES } from "@/lib/messages";
import { cleanShownText } from "@/lib/text/shown-text";

export const GOAL_CATEGORIES = ["sport", "uni", "work", "personal", "other"] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = {
  sport: "Sport",
  uni: "Uni",
  work: "Work",
  personal: "Personal",
  other: "Other",
};

export const DAY_PARTS = ["morning", "afternoon", "evening"] as const;
export type DayPart = (typeof DAY_PARTS)[number];

/** When each part of the day is: from the hour `from` up to (not including) the hour `until`. */
export const DAY_PART_HOURS: Record<DayPart, { from: number; until: number; label: string }> = {
  morning: { from: 0, until: 12, label: "Morning" },
  afternoon: { from: 12, until: 17, label: "Afternoon" },
  evening: { from: 17, until: 24, label: "Evening" },
};

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** The weekdays, Monday first (Monday = 1 to Sunday = 7, as saved). */
export const WEEKDAYS: readonly { day: Weekday; short: string; long: string }[] = [
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
  { day: 7, short: "Sun", long: "Sunday" },
];

export const MAX_CATEGORY_OTHER = 30;
export const MAX_LOCATION = 200;
/** A session lasts 1 minute to 12 hours (R44 allows at most 12 hours a day), to the minute. */
export const MIN_SESSION_MINUTES = 1;
export const MAX_SESSION_MINUTES = 12 * 60;

/** A goal's routine as the server sends it: null for an empty field, [] for no avoided days. */
export type GoalRoutine = {
  category: GoalCategory | null;
  /** Only with the category "other": the person's own word ("Music"). */
  categoryOther: string | null;
  sessionMinutes: number | null;
  /** null: any time (or the own window below). */
  dayPart: DayPart | null;
  /** The own window ("Custom"), minutes after midnight, from (included) to until; both null without one. Never with dayPart. */
  dayFrom: number | null;
  dayUntil: number | null;
  /** Sorted, Monday = 1. */
  avoidDays: Weekday[];
  /** The days it always happens on: sorted, Monday = 1, never one of avoidDays. */
  mustDays: Weekday[];
  /** null: at home or nowhere in particular. */
  location: string | null;
};

export const EMPTY_ROUTINE: GoalRoutine = {
  category: null,
  categoryOther: null,
  sessionMinutes: null,
  dayPart: null,
  dayFrom: null,
  dayUntil: null,
  avoidDays: [],
  mustDays: [],
  location: null,
};

export function isGoalCategory(value: unknown): value is GoalCategory {
  return typeof value === "string" && (GOAL_CATEGORIES as readonly string[]).includes(value);
}

export function isDayPart(value: unknown): value is DayPart {
  return typeof value === "string" && (DAY_PARTS as readonly string[]).includes(value);
}

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

/** The weekday of a local date ("2026-11-20"), Monday = 1 to Sunday = 7, as a routine saves its days. */
export function weekdayOfDate(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  return (((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1) as Weekday;
}

/** The avoided days as saved: their digits in rising order ("" none, "5" Fridays, "67" weekends). */
export function avoidDaysToText(days: readonly Weekday[]): string {
  return [...new Set(days)].sort((a, b) => a - b).join("");
}

/** The saved text back as a sorted list; anything that is not a weekday's digit is left out. */
export function avoidDaysFromText(text: string): Weekday[] {
  const days = [...text].map(Number).filter(isWeekday);
  return [...new Set(days)].sort((a, b) => a - b);
}

/** R44: at most two events a day on the days left (R7's 14 is two a day on seven days). */
export function maxEventsPerWeek(avoidedDays: number): number {
  return 2 * (7 - avoidedDays);
}

/** R44: at most 12 hours a day on the days left, and never more than R7's 60. */
export function maxHoursPerWeek(avoidedDays: number): number {
  return Math.min(60, 12 * (7 - avoidedDays));
}

/** Whether anything of the routine is set (a goal without has no `routine` in what the server sends). */
export function hasRoutine(routine: GoalRoutine): boolean {
  return (
    routine.category !== null ||
    routine.categoryOther !== null ||
    routine.sessionMinutes !== null ||
    routine.dayPart !== null ||
    routine.dayFrom !== null ||
    routine.avoidDays.length > 0 ||
    routine.mustDays.length > 0 ||
    routine.location !== null
  );
}

/** A routine as typed or sent, before it is checked. null (or an empty list) means none. */
export type RoutineInput = {
  category: string | null;
  categoryOther: string | null;
  sessionMinutes: number | null;
  dayPart: string | null;
  avoidDays: readonly number[] | null;
  /** Left out or null: none. */
  mustDays?: readonly number[] | null;
  /** The own window; left out or null: none. */
  dayFrom?: number | null;
  dayUntil?: number | null;
  location: string | null;
};

/** The rules the week must still fit (R44). */
export type RoutineRule = { kind: "count" | "hours"; target: number };

/** The first problem: a short code for the server's answer and the sentence the user sees. */
export type RoutineProblem = { error: string; message: string };

const problem = (error: string, message: string): RoutineProblem => ({ error, message });

/** The own word for "other" as it is saved: trimmed, or null when there is none. Not checked here. */
function trimmedOther(input: RoutineInput): string | null {
  if (input.category !== "other") return null;
  const text = (input.categoryOther ?? "").trim();
  return text === "" ? null : text;
}

function validDays(days: readonly number[] | null | undefined): days is readonly Weekday[] | null | undefined {
  if (days === null || days === undefined) return true;
  return days.every(isWeekday) && new Set(days).size === days.length;
}

/**
 * Checks a whole routine with the goal's rules, in the ontology's order (category, own word, session
 * length, part of the day, avoided days, location, then whether the week still fits). Returns the
 * first problem, or null when the routine is fine.
 */
export function routineProblem(input: RoutineInput, rules: readonly RoutineRule[]): RoutineProblem | null {
  if (input.category !== null && !isGoalCategory(input.category)) return problem("goal_category", MESSAGES.goalCategory);

  // The own word counts only with "other"; with another category it is dropped, not refused.
  const other = trimmedOther(input);
  if (other !== null) {
    if ([...other].length > MAX_CATEGORY_OTHER) return problem("category_other_length", MESSAGES.categoryOtherLength);
    if (cleanShownText(other, MAX_CATEGORY_OTHER) === null) return problem("category_other_form", MESSAGES.categoryOtherForm);
  }

  const minutes = input.sessionMinutes;
  if (
    minutes !== null &&
    (!Number.isInteger(minutes) || minutes < MIN_SESSION_MINUTES || minutes > MAX_SESSION_MINUTES)
  ) {
    return problem("session_minutes", MESSAGES.sessionMinutes);
  }

  if (input.dayPart !== null && !isDayPart(input.dayPart)) return problem("day_part", MESSAGES.dayPart);

  // The own window: both ends or none, inside one day, the end after the start, never with a part of
  // the day, and long enough for one session.
  const from = input.dayFrom ?? null;
  const until = input.dayUntil ?? null;
  if (from !== null || until !== null) {
    const whole = (n: number | null) => n !== null && Number.isInteger(n);
    if (!whole(from) || !whole(until) || from! < 0 || until! > 24 * 60 || from! >= until! || input.dayPart !== null) {
      return problem("day_window", MESSAGES.dayWindow);
    }
    if (minutes !== null && until! - from! < minutes) return problem("day_window_short", MESSAGES.dayWindowShort);
  }

  if (!validDays(input.avoidDays)) return problem("avoid_days", MESSAGES.avoidDays);
  const avoided = input.avoidDays?.length ?? 0;
  if (avoided >= 7) return problem("avoid_all_days", MESSAGES.avoidAllDays);

  // The days it always happens on: weekdays, none ruled out, and never more than the sessions a week.
  if (!validDays(input.mustDays)) return problem("must_days", MESSAGES.mustDays);
  const must = input.mustDays ?? [];
  if (must.some((d) => input.avoidDays?.includes(d))) return problem("must_avoid_day", MESSAGES.mustAvoidDay);
  const count = rules.find((r) => r.kind === "count");
  if (count && must.length > count.target) {
    return problem("must_days_count", MESSAGES.mustDaysCount.replace("{n}", String(count.target)));
  }

  if (input.location !== null && [...input.location.trim()].length > MAX_LOCATION) {
    return problem("location_length", MESSAGES.locationLength);
  }

  for (const rule of rules) {
    if (rule.kind === "count" && rule.target > maxEventsPerWeek(avoided)) {
      return problem("week_count_fit", MESSAGES.weekCountFit.replace("{n}", String(maxEventsPerWeek(avoided))));
    }
    if (rule.kind === "hours" && rule.target > maxHoursPerWeek(avoided)) {
      return problem("week_hours_fit", MESSAGES.weekHoursFit.replace("{n}", String(maxHoursPerWeek(avoided))));
    }
  }
  return null;
}

/**
 * The routine as it is saved: texts trimmed (empty means none), the own word only with "other", the
 * days sorted. Call it only after routineProblem found nothing.
 */
export function cleanRoutine(input: RoutineInput): GoalRoutine {
  const location = (input.location ?? "").trim();
  return {
    category: isGoalCategory(input.category) ? input.category : null,
    categoryOther: trimmedOther(input),
    sessionMinutes: input.sessionMinutes,
    dayPart: isDayPart(input.dayPart) ? input.dayPart : null,
    dayFrom: input.dayFrom ?? null,
    dayUntil: input.dayUntil ?? null,
    avoidDays: avoidDaysFromText(avoidDaysToText((input.avoidDays ?? []).filter(isWeekday))),
    mustDays: avoidDaysFromText(avoidDaysToText((input.mustDays ?? []).filter(isWeekday))),
    location: location === "" ? null : location,
  };
}
