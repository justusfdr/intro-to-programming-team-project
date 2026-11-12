// The focus score and the analytics of a week (R19, R20). Calculated every time from finished
// sessions and blocked attempts; never saved. Pure functions, no database and no React.
import { addDays, localDateOf, type LocalDate } from "@/lib/time/zoned";

/** A finished session as the analytics need it. */
export type FinishedSession = { startedAt: Date; endedAt: Date; plannedMinutes: number; focusedMinutes: number };
/** A blocked attempt: the site and when it happened. */
export type Attempt = { domain: string; attemptedAt: Date };

/** R19: 100 × focused ÷ planned, rounded, minus 5 per attempt, kept between 0 and 100. */
export function sessionScore(session: Pick<FinishedSession, "plannedMinutes" | "focusedMinutes">, attemptsDuring: number): number {
  const base = Math.round((100 * session.focusedMinutes) / session.plannedMinutes);
  return Math.min(100, Math.max(0, base - 5 * attemptsDuring));
}

/** The attempts that count for a session: from its start to its end, both included. */
export function attemptsDuring(session: Pick<FinishedSession, "startedAt" | "endedAt">, attempts: Attempt[]): number {
  return attempts.filter((a) => a.attemptedAt >= session.startedAt && a.attemptedAt <= session.endedAt).length;
}

/** The average of the scores, rounded; null when there are none (shown as "–", not 0). */
export function averageScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

export type Totals = { focusedMinutes: number; sessions: number; score: number | null; attempts: number };
export type DayAnalytics = Totals & { date: LocalDate };
export type WeekAnalytics = {
  days: DayAnalytics[];
  week: Totals;
  /** The five most blocked sites of the week, most first (ties in alphabetical order). */
  topSites: { domain: string; count: number }[];
};

/**
 * The analytics of the week from `monday` in `timeZone` (R20). Sessions belong to the day they
 * start, attempts to the day they happened (R2). `attempts` must include every attempt that may
 * lie inside one of the sessions, also just outside the week.
 */
export function weekAnalytics(sessions: FinishedSession[], attempts: Attempt[], monday: LocalDate, timeZone: string): WeekAnalytics {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const scored = sessions.map((session) => ({
    session,
    date: localDateOf(session.startedAt, timeZone),
    score: sessionScore(session, attemptsDuring(session, attempts)),
  }));
  const attemptDates = attempts.map((a) => ({ attempt: a, date: localDateOf(a.attemptedAt, timeZone) }));

  const totalsOf = (inScope: (date: LocalDate) => boolean): Totals => {
    const own = scored.filter((s) => inScope(s.date));
    return {
      focusedMinutes: own.reduce((sum, s) => sum + s.session.focusedMinutes, 0),
      sessions: own.length,
      score: averageScore(own.map((s) => s.score)),
      attempts: attemptDates.filter((a) => inScope(a.date)).length,
    };
  };

  const inWeek = (date: LocalDate) => dates.includes(date);
  const counts = new Map<string, number>();
  for (const { attempt, date } of attemptDates) if (inWeek(date)) counts.set(attempt.domain, (counts.get(attempt.domain) ?? 0) + 1);

  return {
    days: dates.map((date) => ({ date, ...totalsOf((d) => d === date) })),
    week: totalsOf(inWeek),
    topSites: [...counts]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
      .slice(0, 5),
  };
}

/** "–" for no score (R19), else the number. */
export function scoreText(score: number | null): string {
  return score === null ? "–" : String(score);
}
