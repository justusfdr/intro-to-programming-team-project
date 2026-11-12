// What the Analytics page gets from the server.
import type { WeekAnalytics } from "./score";

export type AnalyticsData = {
  timeZone: string;
  monday: string;
  previous: string;
  next: string;
  /** The Monday of the current week (for "This week"). */
  thisWeek: string;
  /** Today's date when it lies in the shown week, else null. */
  today: string | null;
  analytics: WeekAnalytics;
};
