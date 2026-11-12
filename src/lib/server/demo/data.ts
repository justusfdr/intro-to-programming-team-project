import "server-only";

// The demo week ("Explore the demo", spec 13), taken over from the first prototype's demo data and
// translated to our model: the three goals with their titles, colours, icons and reasons, each with a
// deadline five weeks from today and one hours-per-week rule (6, 4 and 8 hours); the prototype's
// tasks without its two habits, with due dates relative to today (its "Life admin" list does not
// exist here, so those two tasks go to the Inbox); and its week of events for the current week.
// Left out on purpose (decided): guests, milestones, ratings, focus history, locations, the coach.
import type { GoalColorName, GoalIconName } from "@/lib/goals/style";
import { addDays, type LocalDate } from "@/lib/time/zoned";

type DemoGoalKey = "youtube" | "run" | "app";

export type DemoGoal = {
  key: DemoGoalKey;
  title: string;
  why: string;
  color: GoalColorName;
  icon: GoalIconName;
  hoursPerWeek: number;
};

export const DEMO_GOALS: DemoGoal[] = [
  {
    key: "youtube",
    title: "Grow my YouTube channel",
    why: "Share what I learn and get comfortable on camera.",
    color: "rose",
    icon: "video",
    hoursPerWeek: 6,
  },
  {
    key: "run",
    title: "Run a half marathon under 2h",
    why: "Stay fit, even when the semester gets busy.",
    color: "teal",
    icon: "footprints",
    hoursPerWeek: 4,
  },
  { key: "app", title: "Launch app v2", why: "Real users instead of demo data.", color: "indigo", icon: "rocket", hoursPerWeek: 8 },
];

/** The deadline of every demo goal: five weeks from today. */
export const DEMO_DEADLINE_DAYS = 35;

type DemoEvent = {
  /** 0 = Monday of the current week. */
  day: number;
  from: string;
  to: string;
  goal: DemoGoalKey | null;
  title: string;
  /** The prototype's "skipped" block: it stays planned here, as the app has no skipped status. */
  skipped?: boolean;
};

/** The prototype's week, Monday to Saturday, in its order. */
export const DEMO_EVENTS: DemoEvent[] = [
  { day: 0, from: "07:30", to: "08:15", goal: "run", title: "Easy 5K" },
  { day: 0, from: "09:00", to: "10:30", goal: "youtube", title: "Script the next video" },
  { day: 0, from: "11:00", to: "12:30", goal: "app", title: "Review beta interviews" },
  { day: 0, from: "14:00", to: "15:30", goal: null, title: "Statistics lecture" },
  { day: 0, from: "16:00", to: "16:30", goal: null, title: "Inbox zero" },
  { day: 1, from: "08:30", to: "10:00", goal: "youtube", title: "Film + voiceover" },
  { day: 1, from: "10:30", to: "12:30", goal: "app", title: "Deep work: beta fixes" },
  { day: 1, from: "13:00", to: "14:00", goal: null, title: "Lunch with Lea" },
  { day: 1, from: "18:00", to: "19:00", goal: "run", title: "Intervals 6 × 800 m" },
  { day: 2, from: "09:30", to: "11:00", goal: "youtube", title: "Edit episode 1" },
  { day: 2, from: "11:30", to: "12:30", goal: null, title: "Admin", skipped: true },
  { day: 2, from: "15:00", to: "16:30", goal: null, title: "Group project meeting" },
  { day: 3, from: "09:00", to: "09:45", goal: null, title: "Statistics office hours" },
  { day: 3, from: "14:00", to: "15:30", goal: null, title: "Marketing lecture" },
  { day: 3, from: "17:00", to: "18:00", goal: "run", title: "Easy run" },
  { day: 4, from: "12:30", to: "13:30", goal: "youtube", title: "Film episode 2" },
  { day: 4, from: "11:30", to: "12:00", goal: null, title: "Inbox zero" },
  { day: 4, from: "14:00", to: "16:00", goal: "app", title: "Prepare the release" },
  { day: 5, from: "09:00", to: "11:00", goal: "run", title: "Long run 16 km" },
  { day: 4, from: "16:30", to: "17:30", goal: null, title: "Admin" },
];

export type DemoTask = { title: string; goal: DemoGoalKey | null; dueDate: LocalDate | null; done: boolean };

const later = (a: LocalDate, b: LocalDate) => (a > b ? a : b);

/**
 * The prototype's tasks without its two habits. Due dates follow the prototype (today, tomorrow, Friday
 * and Sunday of this week, in nine days); a Friday that has already passed becomes today, because a
 * due date may not be set in the past.
 */
export function demoTasks(today: LocalDate, monday: LocalDate): DemoTask[] {
  return [
    { title: "Fix the onboarding bug", goal: "app", dueDate: today, done: false },
    { title: "Cluster beta feedback", goal: "app", dueDate: null, done: false },
    { title: "Write release notes", goal: "app", dueDate: later(addDays(monday, 4), today), done: false },
    { title: "Brainstorm thumbnail ideas", goal: "youtube", dueDate: addDays(today, 1), done: false },
    { title: "Update channel banner", goal: "youtube", dueDate: null, done: true },
    { title: "Buy new running shoes", goal: "run", dueDate: null, done: false },
    { title: "Sign up for the half marathon", goal: "run", dueDate: null, done: true },
    { title: "Call mom back", goal: null, dueDate: addDays(monday, 6), done: false },
    { title: "Renew passport", goal: null, dueDate: addDays(today, 9), done: false },
  ];
}
