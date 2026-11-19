// The widgets in the sidebar (spec 47): which kinds there are, in which sizes, and what the server sends
// for them. Shared by the browser and the server; the server checks every saved layout with layout.ts.
import type { GoalLook } from "@/lib/goals/style";
import type { TimeFormat } from "@/lib/time/display";

export const WIDGET_KINDS = ["weather", "next", "leave", "goal", "focus", "free"] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

/** Columns × rows of the grid. 1x1 is one field of 64 × 64 px. */
export const WIDGET_SIZES = ["1x1", "3x1", "3x2", "3x4"] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

/**
 * One widget in the user's list. A goal widget names its goal; without one it shows the first goal.
 * A weather widget may name a city to always show; without one it follows the user (R48).
 */
/** A field of the grid: row 0 to 5 from the top, column 0 to 2 from the left. */
export type WidgetCellAt = { row: number; col: number };
/** `at`: the field the user put the widget in (its top left); without it, it takes the first free place. */
export type WidgetItem = { kind: WidgetKind; size: WidgetSize; goalId?: string | null; city?: string | null; at?: WidgetCellAt };

/** A weather widget's city: 1 to 80 characters after trimming, on one line. */
export const MAX_CITY_LENGTH = 80;

/** The sizes each kind comes in, the usual one first. */
export const SIZES_OF: Record<WidgetKind, readonly WidgetSize[]> = {
  weather: ["3x2", "1x1"],
  next: ["3x2", "3x4"],
  leave: ["1x1", "3x1"],
  goal: ["1x1"],
  focus: ["1x1"],
  free: ["3x1"],
};

/** Names in the gallery and for screen readers. */
export const WIDGET_NAMES: Record<WidgetKind, string> = {
  weather: "Weather",
  next: "Next up",
  leave: "Time to leave",
  goal: "Goal",
  focus: "Focus today",
  free: "Free time",
};

export const GRID_COLUMNS = 3;
export const GRID_ROWS = 6;
/** One field and the gap between fields, in px. */
export const CELL_PX = 64;
export const GAP_PX = 8;

/** What a new account starts with, and what "Reset" brings back. Exactly fills the 3 × 6 grid. */
export const DEFAULT_LAYOUT: WidgetItem[] = [
  { kind: "weather", size: "3x2" },
  { kind: "next", size: "3x2" },
  { kind: "leave", size: "1x1" },
  { kind: "goal", size: "1x1", goalId: null },
  { kind: "focus", size: "1x1" },
  { kind: "free", size: "3x1" },
];

/** An event as the widgets show it. Times are ISO strings in UTC. */
export type WidgetEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  /** The address, a web link or null. */
  location: string | null;
  /** The event's goal, or null. */
  goal: { title: string; look: GoalLook } | null;
  todos: { done: number; total: number };
  guests: number;
  /** It has an address the app can work out a trip to (not a web link, not all-day). */
  travelable: boolean;
};

/** A goal's week as a ring: its first rule, done against the target ("2 of 4", "3.5 of 6 h"). */
export type WidgetGoal = {
  id: string;
  title: string;
  look: GoalLook;
  /** Events done this week (count rule) or hours done, rounded down to a tenth (hours rule). */
  done: number;
  target: number;
  unit: "count" | "hours";
  /** Every rule of the goal is met this week. */
  met: boolean;
};

/** Everything the widgets need, read in one go (action widgets_data). */
export type WidgetsData = {
  /** The saved list, or the standard one when none is saved. */
  layout: WidgetItem[];
  /** True when the user never saved a layout (the standard one is shown). */
  isDefault: boolean;
  now: string;
  timeZone: string;
  timeFormat: TimeFormat;
  /** The event happening now, else the next one that starts later today; null when there is none. */
  next: WidgetEvent | null;
  /** The event after `next`, later today. */
  after: { title: string; start: string } | null;
  /** The first timed event tomorrow, for "Nothing else today". */
  tomorrow: { title: string; start: string } | null;
  /** The next event today that has not started and has an address: the one to leave for. */
  trip: WidgetEvent | null;
  goals: WidgetGoal[];
  /** Minutes focused today in Focus sessions, the running one up to now. */
  focusMinutes: number;
  /** The next free stretch today of at least 30 minutes, before the end of the visible day. */
  free: { start: string; end: string } | null;
};
