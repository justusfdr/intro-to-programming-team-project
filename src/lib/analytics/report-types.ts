// What the Analytics page (spec 49) gets from the server: every number of one shown week, already
// calculated. The server fills it (src/lib/server/analytics/report.ts with the pure functions in
// src/lib/analytics/report.ts); the page only draws it. Nothing here is saved.
import type { GoalColorName, GoalIconName } from "@/lib/goals/style";
import type { WeekStatus } from "@/lib/goals/progress";
import type { LocalDate } from "@/lib/time/zoned";
import type { DayAnalytics, Totals } from "./score";

/** A goal as a widget shows it. `color` is the saved colour or the calculated one (R35). */
export type GoalRef = { id: string; title: string; color: GoalColorName; icon: GoalIconName };

/** The four numbers of one week (R20). */
export type WeekNumbers = Totals & { monday: LocalDate };

/** The five parts of the day sessions and blocked visits are sorted into, by local start hour. */
export const HOUR_BLOCKS = [
  { id: "early", label: "Before 9 am", from: 0, until: 9 },
  { id: "morning", label: "9 – 11 am", from: 9, until: 11 },
  { id: "midday", label: "11 am – 2 pm", from: 11, until: 14 },
  { id: "afternoon", label: "2 – 4 pm", from: 14, until: 16 },
  { id: "late", label: "After 4 pm", from: 16, until: 24 },
] as const;
export type HourBlockId = (typeof HOUR_BLOCKS)[number]["id"];

export type FocusNumbers = {
  week: Totals;
  /** The week before the shown one. */
  lastWeek: Totals;
  /** Monday to Sunday of the shown week. */
  days: DayAnalytics[];
  /** The 8 weeks ending with the shown week, oldest first. */
  weeks: WeekNumbers[];
  /** Average focused minutes of those 8 weeks, rounded. */
  averageMinutes: number;
  /** Sessions of the week whose focused minutes reached the planned minutes. */
  finishedAsPlanned: number;
  /** Days of the week with at least one finished session. */
  activeDays: number;
  /** Finished sessions of the 8 weeks by the part of the day they started in. */
  hours: { block: HourBlockId; sessions: number; score: number | null }[];
  /** The block with the highest average score among blocks with at least 2 sessions, else null. */
  bestBlock: HourBlockId | null;
  /** Null when the week has no finished session. */
  longest: { minutes: number; date: LocalDate; goal: string | null } | null;
  bestScore: { score: number; date: LocalDate } | null;
  bestDay: { date: LocalDate; minutes: number; sessions: number } | null;
  /** Finished sessions per weekday (0 = Monday) over the 4 weeks ending with the shown week. */
  weekdays: number[];
  /** How many finished sessions those 4 weeks had. */
  weekdaySessions: number;
  /** Focused minutes per day for the 84 days ending with the shown week's Sunday, oldest first. Level: 0, 1 (under 60), 2 (under 120), 3. */
  heat: { date: LocalDate; minutes: number; level: 0 | 1 | 2 | 3 }[];
};

export type RuleNumbers = {
  /** "sessions" for a count rule, "hours" for an hours rule. */
  unit: "sessions" | "hours";
  /** Done so far: events that count, or hours rounded down to a tenth. */
  done: number;
  target: number;
  status: WeekStatus;
};

export type GoalNumbers = {
  goal: GoalRef;
  rules: RuleNumbers[];
  /** The goal's week (R9): met if all rules are met, missed if any is missed, else open. */
  status: WeekStatus;
  /** Weeks in a row the goal was met, ending with the shown week (an open week neither counts nor breaks). */
  weeksInRow: number;
  /** Null: no end date. */
  deadline: LocalDate | null;
  /** Days from today to the deadline (0 = today, negative = past); null without a deadline. */
  daysLeft: number | null;
};

export type PlanItem = { eventId: string; title: string; goal: GoalRef; state: "done" | "not_done" | "planned" };

export type GoalsNumbers = {
  /** Only goals with at least one rule. */
  list: GoalNumbers[];
  /** Goals whose week is met, and how many goals were judged. */
  reached: number;
  judged: number;
  /** The same two numbers for the 4 weeks ending with the shown week, oldest first. */
  lastWeeks: { monday: LocalDate; reached: number; judged: number }[];
  /** Monday to Sunday: the timed events of a goal on that day, in the order they start. */
  plan: { date: LocalDate; items: PlanItem[] }[];
  planDone: number;
  planTotal: number;
  /** Planned and already over, not marked done; earliest first, at most 5. */
  slipped: { eventId: string; title: string; goal: GoalRef; startAt: string; minutes: number }[];
};

export type TimeNumbers = {
  /** Minutes of done timed events per day; `parts` per goal (goal null = "No goal"), largest first. */
  days: { date: LocalDate; minutes: number; parts: { goalId: string | null; minutes: number }[] }[];
  /** Goals (and "No goal": goal null) sorted by done minutes of the week, most first; only those with minutes in this or the last week. */
  areas: { goal: GoalRef | null; minutes: number; lastWeekMinutes: number }[];
  doneMinutes: number;
  lastWeekDoneMinutes: number;
  /** Done minutes that belong to a goal. */
  goalMinutes: number;
  /** Null when no day has done minutes. */
  busiest: { date: LocalDate; minutes: number; events: number } | null;
  /** The day of the week with the fewest done minutes (the earliest of them), when busiest exists. */
  quietest: { date: LocalDate; minutes: number } | null;
  /** Plan kept: done minutes against the minutes of all timed events of the week that have ended. */
  endedMinutes: number;
  /** Rounded percent, null when endedMinutes is 0. */
  planKept: number | null;
  planKeptLastWeek: number | null;
};

export type StreakNumbers = {
  /** Days in a row with a finished session or a done goal event; at most 84. */
  current: number;
  /** The longest such run in the 84 days; at least `current`. */
  record: number;
};

export type BlockedNumbers = {
  week: number;
  lastWeek: number;
  /** Blocked visits during sessions ÷ finished sessions, one decimal; null without sessions. */
  perSession: number | null;
  /** One entry per finished session of the week, in start order: true = no blocked visit during it. */
  sessionsClean: boolean[];
  cleanSessions: number;
  /** Blocked visits of the week by part of the day. */
  hours: { block: HourBlockId; count: number }[];
  /** The block with the most visits; null when the week has none. */
  worstBlock: HourBlockId | null;
  topSites: { domain: string; count: number }[];
};

export const TOPICS = ["focus", "goals", "time", "streaks", "blocked"] as const;
export type Topic = (typeof TOPICS)[number];

/** What goes well and what does not, written by fixed rules (src/lib/analytics/insights.ts). */
export type Insights = { good: string[]; bad: string[]; summary: string };

export type AnalyticsReport = {
  timeZone: string;
  monday: LocalDate;
  previous: LocalDate;
  next: LocalDate;
  /** The Monday of the current week. */
  thisWeek: LocalDate;
  /** Today's date when it lies in the shown week, else null. */
  today: LocalDate | null;
  /** True when the shown week has not ended yet. */
  isCurrentWeek: boolean;
  focus: FocusNumbers;
  goals: GoalsNumbers;
  time: TimeNumbers;
  streaks: StreakNumbers;
  blocked: BlockedNumbers;
  insights: Record<Topic, Insights>;
  /** One or two sentences about the whole week, for the Overview. */
  summary: string;
};

// ---- The page's layout (spec 49, "Edit widgets") ----

export const TABS = ["overview", "focus", "goals", "time", "streaks", "blocked"] as const;
export type Tab = (typeof TABS)[number];
export const TAB_LABELS: Record<Tab, string> = { overview: "Overview", focus: "Focus", goals: "Goals", time: "Time", streaks: "Streaks", blocked: "Distractions" };

/** S = 1 field, M = 2 fields wide, L = 3 fields wide; every widget is 1 field high. */
export const SIZES = ["S", "M", "L"] as const;
export type Size = (typeof SIZES)[number];
export const FIELDS_OF: Record<Size, number> = { S: 1, M: 2, L: 3 };
export const GRID_COLUMNS = 4;
export const GRID_ROWS = 2;

/** Every widget: its topic (the tab it belongs to, and whose insights its details show), name, what it says and its sizes (the first is the standard one). */
export const WIDGETS = {
  focus_time: { topic: "focus", title: "Focus time", about: "Your week in one number, with a bar a day", sizes: ["M", "L"] },
  focus_score: { topic: "focus", title: "Focus score", about: "How much of the planned time you focused", sizes: ["S"] },
  sessions: { topic: "focus", title: "Focus sessions", about: "How many, and how long on average", sizes: ["S"] },
  weeks: { topic: "focus", title: "Compared to other weeks", about: "This week next to the last eight", sizes: ["M", "L"] },
  best_hours: { topic: "focus", title: "Your best hours", about: "The time of day your sessions go best", sizes: ["S", "M"] },
  best_of_week: { topic: "focus", title: "Best of this week", about: "Longest session, best score, best day", sizes: ["S"] },
  goals_reached: { topic: "goals", title: "Did you reach your goals?", about: "Each goal with a ring: reached or not", sizes: ["M", "L"] },
  goal_streaks: { topic: "goals", title: "Weeks in a row", about: "How long each goal has been on target", sizes: ["S", "M"] },
  deadlines: { topic: "goals", title: "Deadlines", about: "Days left until each goal is due", sizes: ["S"] },
  plan: { topic: "goals", title: "Plan, day by day", about: "What you planned and what you did", sizes: ["L", "M"] },
  slipped: { topic: "goals", title: "What slipped", about: "Planned sessions you did not get to", sizes: ["S", "M"] },
  time_by_day: { topic: "time", title: "Your time, day by day", about: "Monday to Sunday, coloured by goal", sizes: ["L", "M"] },
  top_areas: { topic: "time", title: "Your top areas", about: "Where your time went, sorted", sizes: ["S", "M"] },
  plan_kept: { topic: "time", title: "Plan kept", about: "Done time against planned time", sizes: ["M", "S"] },
  busiest_day: { topic: "time", title: "Busiest day", about: "The day you got the most done", sizes: ["S"] },
  time_on_goals: { topic: "time", title: "Time on your goals", about: "How much of your time went to a goal", sizes: ["S"] },
  streak: { topic: "streaks", title: "Streak", about: "Days in a row, and your record", sizes: ["M", "S"] },
  heatmap: { topic: "streaks", title: "Last 12 weeks", about: "A square a day, darker for more focus", sizes: ["M", "L"] },
  weekdays: { topic: "streaks", title: "Focus by weekday", about: "Which weekdays you usually focus on", sizes: ["M", "S"] },
  blocked_visits: { topic: "blocked", title: "Blocked visits", about: "How often a site was stopped", sizes: ["S"] },
  clean_sessions: { topic: "blocked", title: "Clean sessions", about: "Sessions without a blocked visit", sizes: ["S"] },
  blocked_weeks: { topic: "blocked", title: "Blocked visits per week", about: "The last eight weeks", sizes: ["M", "L"] },
  blocked_hours: { topic: "blocked", title: "When you get distracted", about: "Blocked visits by time of day", sizes: ["M", "S"] },
  top_sites: { topic: "blocked", title: "Most blocked sites", about: "The sites that pulled at you most", sizes: ["M", "S"] },
  week_in_short: { topic: "overview", title: "Your week in short", about: "What went well and what needs attention", sizes: ["M", "L"] },
} as const satisfies Record<string, { topic: Topic | "overview"; title: string; about: string; sizes: readonly Size[] }>;
export type WidgetKind = keyof typeof WIDGETS;
export const WIDGET_KINDS = Object.keys(WIDGETS) as WidgetKind[];

export type WidgetItem = { kind: WidgetKind; size: Size };
/** Per tab the widgets in the order they are placed (rows fill from the left). */
export type AnalyticsLayout = Record<Tab, WidgetItem[]>;

/** The layout a user sees until they save their own. Every tab fills exactly 8 fields. */
export const STANDARD_LAYOUT: AnalyticsLayout = {
  overview: [
    { kind: "focus_time", size: "M" },
    { kind: "goals_reached", size: "M" },
    { kind: "streak", size: "S" },
    { kind: "focus_score", size: "S" },
    { kind: "week_in_short", size: "M" },
  ],
  focus: [
    { kind: "focus_time", size: "M" },
    { kind: "sessions", size: "S" },
    { kind: "focus_score", size: "S" },
    { kind: "weeks", size: "M" },
    { kind: "best_hours", size: "S" },
    { kind: "best_of_week", size: "S" },
  ],
  goals: [
    { kind: "goals_reached", size: "M" },
    { kind: "goal_streaks", size: "S" },
    { kind: "deadlines", size: "S" },
    { kind: "plan", size: "L" },
    { kind: "slipped", size: "S" },
  ],
  time: [
    { kind: "time_by_day", size: "L" },
    { kind: "top_areas", size: "S" },
    { kind: "plan_kept", size: "M" },
    { kind: "busiest_day", size: "S" },
    { kind: "time_on_goals", size: "S" },
  ],
  streaks: [
    { kind: "streak", size: "M" },
    { kind: "heatmap", size: "M" },
    { kind: "goal_streaks", size: "M" },
    { kind: "weekdays", size: "M" },
  ],
  blocked: [
    { kind: "blocked_visits", size: "S" },
    { kind: "clean_sessions", size: "S" },
    { kind: "blocked_weeks", size: "M" },
    { kind: "blocked_hours", size: "M" },
    { kind: "top_sites", size: "M" },
  ],
};
