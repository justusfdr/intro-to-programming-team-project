// The dates of a repeating event (R28). Pure function, no database and no React.
// daily: every day; weekly: the chosen weekdays, always with the first date's; monthly: the same day
// of the month, skipping months without it. From the first date until repeat_until, both included.
import { addDays, isLocalDate, type LocalDate } from "@/lib/time/zoned";

export type Frequency = "daily" | "weekly" | "monthly";
/** 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type RepeatRule = { frequency: Frequency; weekdays: Weekday[]; until: LocalDate };

export const MAX_DATES = 100;

/** The weekday of a local date, 1 = Monday … 7 = Sunday. */
export function weekdayOf(date: LocalDate): Weekday {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return (day === 0 ? 7 : day) as Weekday;
}

/**
 * All dates of the series, or "too_many" when there would be more than 100. Expects `until` on or
 * after `first` (the action checks that first, with its own message).
 */
export function repeatDates(first: LocalDate, rule: RepeatRule): LocalDate[] | "too_many" {
  const dates: LocalDate[] = [];
  const add = (date: LocalDate) => {
    dates.push(date);
    return dates.length > MAX_DATES;
  };

  if (rule.frequency === "monthly") {
    const [y, m, d] = first.split("-").map(Number);
    for (let i = 0; ; i++) {
      const year = y + Math.floor((m - 1 + i) / 12);
      const month = ((m - 1 + i) % 12) + 1;
      if (`${year}-${String(month).padStart(2, "0")}-01` > rule.until) break;
      const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!isLocalDate(date)) continue; // this month has no such day
      if (date > rule.until) break;
      if (add(date)) return "too_many";
    }
    return dates;
  }

  const weekdays = new Set<Weekday>(rule.frequency === "weekly" ? [...rule.weekdays, weekdayOf(first)] : [1, 2, 3, 4, 5, 6, 7]);
  for (let date = first; date <= rule.until; date = addDays(date, 1)) {
    if (weekdays.has(weekdayOf(date)) && add(date)) return "too_many";
  }
  return dates;
}

/**
 * The end date a new series gets until the user picks one (issue #129): daily for about 3 months
 * (90 dates), weekly for 12 weeks, monthly for a year (12 months). It depends only on the frequency,
 * not on the weekdays: even all seven days for 12 weeks are 84 dates, under the limit of 100, so tapping
 * a day never moves the end date (spec 66).
 */
export function defaultUntil(first: LocalDate, frequency: Frequency): LocalDate {
  return addDays(first, frequency === "daily" ? 89 : frequency === "weekly" ? 83 : 363);
}
