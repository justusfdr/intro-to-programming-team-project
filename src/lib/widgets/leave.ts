// How urgent leaving is (spec 47): the colour of "Time to leave" and of the leave line in "Next up".
// Soft tints while there is time; full red from 10 minutes; at 0 it pulses; after that it counts up.

export type LeaveLevel = "green" | "amber" | "orange" | "red" | "now" | "late";

/** Whole minutes from `now` until `leaveAt`, rounded up: 9 min 10 s left is "10 min". */
export function minutesUntil(leaveAt: Date, now: Date): number {
  // `|| 0`: Math.ceil(-0.5) is -0, which should read as 0 ("Leave now").
  return Math.ceil((leaveAt.getTime() - now.getTime()) / 60_000) || 0;
}

/** More than 30 minutes green, 21–30 amber, 11–20 orange, 1–10 red, 0 now, below 0 late. */
export function leaveLevel(minutes: number): LeaveLevel {
  if (minutes < 0) return "late";
  if (minutes === 0) return "now";
  if (minutes <= 10) return "red";
  if (minutes <= 20) return "orange";
  if (minutes <= 30) return "amber";
  return "green";
}

/** "Leave in 12 min", "Leave now", "4 min late"; above an hour "Leave in 1 h 5 min" ("Leave in 1h 5m" when `short`). */
export function leaveLine(minutes: number, short = false): string {
  const text = short ? shortDuration : durationText;
  if (minutes < 0) return `${text(-minutes)} late`;
  if (minutes === 0) return "Leave now";
  return `Leave in ${text(minutes)}`;
}

/** "12 min", "1 h", "1 h 5 min". */
export function durationText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** For the small tile, which has room for about six characters: "26 min", "5 h", "5h 26m". */
export function shortDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h}h ${m}m`;
}
