// R31: the totals the assistant may use for questions about the past, added up by our server, never by
// Claude. The current week and the 7 before (Monday to Sunday in the user's time zone, R2):
// - per week and goal: minutes of `done` timed events and focused minutes of finished sessions
//   (a session counts for its event's goal, else "no goal");
// - for `done` events without a goal: minutes per title, only the 20 titles with the most minutes.
// The assistant sees only these numbers: no single past events, nothing older than 8 weeks.
import { addDays, localDateOf, mondayOf, startOfLocalDate } from "@/lib/time/zoned";

export const TOTAL_WEEKS = 8;
export const TOP_TITLES = 20;

/** A done timed event (only those are read). */
export type DoneEventInput = { title: string; goalId: string | null; startAt: Date; endAt: Date };

/** A finished session: the week it started in and its focused minutes (R13), and its event's goal. */
export type SessionInput = { startedAt: Date; focusedMinutes: number; goalId: string | null };

export type GoalName = { id: string; title: string };

export type GoalWeekTotal = {
  /** The goal's id, or null for "no goal". */
  goalId: string | null;
  goal: string;
  doneMinutes: number;
  focusedMinutes: number;
};

export type WeekTotals = { monday: string; goals: GoalWeekTotal[] };

export type TitleTotal = { title: string; minutes: number; weeks: { monday: string; minutes: number }[] };

export type ChatTotals = {
  /** Oldest week first; the last one is the current week. */
  weeks: WeekTotals[];
  /** Done events without a goal, by title; the 20 titles with the most minutes, most first. */
  noGoalTitles: TitleTotal[];
};

export const NO_GOAL = "No goal";

/** The first instant that counts: Monday 00:00 of the week 7 weeks before the current one. */
export function totalsWindow(now: Date, timeZone: string): { from: Date; until: Date } {
  const monday = mondayOf(localDateOf(now, timeZone));
  return {
    from: startOfLocalDate(addDays(monday, -7 * (TOTAL_WEEKS - 1)), timeZone),
    until: startOfLocalDate(addDays(monday, 7), timeZone),
  };
}

const minutesBetween = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / 60000);

export function chatTotals(
  input: { doneEvents: readonly DoneEventInput[]; sessions: readonly SessionInput[]; goals: readonly GoalName[] },
  now: Date,
  timeZone: string,
): ChatTotals {
  const currentMonday = mondayOf(localDateOf(now, timeZone));
  const mondays = Array.from({ length: TOTAL_WEEKS }, (_, i) => addDays(currentMonday, -7 * (TOTAL_WEEKS - 1 - i)));
  const inWindow = new Set(mondays);
  const goalTitle = new Map(input.goals.map((g) => [g.id, g.title]));

  // week -> goal key -> totals; the key "" stands for "no goal".
  const perWeek = new Map<string, Map<string, GoalWeekTotal>>(mondays.map((m) => [m, new Map()]));
  const totalFor = (monday: string, goalId: string | null): GoalWeekTotal | null => {
    // A goal deleted since then counts as "no goal".
    const id = goalId !== null && goalTitle.has(goalId) ? goalId : null;
    const week = perWeek.get(monday);
    if (!week) return null;
    const key = id ?? "";
    let total = week.get(key);
    if (!total) {
      total = { goalId: id, goal: id === null ? NO_GOAL : goalTitle.get(id)!, doneMinutes: 0, focusedMinutes: 0 };
      week.set(key, total);
    }
    return total;
  };

  const titles = new Map<string, Map<string, number>>();
  for (const event of input.doneEvents) {
    const monday = mondayOf(localDateOf(event.startAt, timeZone));
    if (!inWindow.has(monday)) continue;
    const minutes = minutesBetween(event.startAt, event.endAt);
    totalFor(monday, event.goalId)!.doneMinutes += minutes;
    if (event.goalId === null || !goalTitle.has(event.goalId)) {
      const byWeek = titles.get(event.title) ?? new Map<string, number>();
      byWeek.set(monday, (byWeek.get(monday) ?? 0) + minutes);
      titles.set(event.title, byWeek);
    }
  }
  for (const session of input.sessions) {
    const monday = mondayOf(localDateOf(session.startedAt, timeZone));
    if (!inWindow.has(monday)) continue;
    totalFor(monday, session.goalId)!.focusedMinutes += session.focusedMinutes;
  }

  const weeks = mondays.map((monday) => ({
    monday,
    goals: [...perWeek.get(monday)!.values()].sort(
      (a, b) => (a.goalId === null ? 1 : 0) - (b.goalId === null ? 1 : 0) || a.goal.localeCompare(b.goal),
    ),
  }));

  const noGoalTitles = [...titles.entries()]
    .map(([title, byWeek]) => ({
      title,
      minutes: [...byWeek.values()].reduce((sum, m) => sum + m, 0),
      weeks: mondays.filter((m) => byWeek.has(m)).map((monday) => ({ monday, minutes: byWeek.get(monday)! })),
    }))
    .sort((a, b) => b.minutes - a.minutes || a.title.localeCompare(b.title))
    .slice(0, TOP_TITLES);

  return { weeks, noGoalTitles };
}
