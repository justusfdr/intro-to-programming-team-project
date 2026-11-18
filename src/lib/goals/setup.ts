// The guided questions for a new goal (spec 42). Pure: no React, no server. Six questions (what it is
// about and its name, how often and how long, where, when in the day, the days it always happens on and
// the days it is never done on,
// whether there is a date), then a review. The screens use these functions for every rule: whether
// "Continue" is possible and, if not, the sentence to show; the quiet hints that never block; the exact
// body of create_goal; the tags of the goal taking shape and the review's sentence (also on the goal card).
// The questions are stricter than the server (R44 allows two sessions a day): at most one session a day,
// so the times a week never exceed the days left. Everything the routine already has (lists, labels,
// limits) comes from routine.ts.
import { MESSAGES } from "@/lib/messages";
import { fmtDayMonth, fmtHourSetting, fmtRange, fmtTime, type TimeFormat } from "@/lib/time/display";
import { addDays, type LocalDate } from "@/lib/time/zoned";
import {
  DAY_PART_HOURS,
  EMPTY_ROUTINE,
  GOAL_CATEGORY_LABELS,
  MAX_LOCATION,
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  routineProblem,
  WEEKDAYS,
  type DayPart,
  type GoalCategory,
  type GoalRoutine,
  type Weekday,
} from "./routine";
import type { GoalColorName, GoalIconName } from "./style";

// ---------- The questions and the answers ----------

/** The six questions, in order. */
export const SETUP_STEPS = ["category", "often", "place", "when", "days", "date"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/** 1 for the first question to 6 for the last. */
export function questionNumber(step: SetupStep): number {
  return SETUP_STEPS.indexOf(step) + 1;
}

/** Where a saved goal is done: nowhere in particular, a saved place (its address is copied), or a typed address. */
export type PlaceChoice = { kind: "home" } | { kind: "saved"; id: string; name: string; address: string } | { kind: "address" };

export type SetupAnswers = {
  category: GoalCategory | null;
  title: string;
  /** Only used with "other" ("Music"); may stay empty. */
  categoryOther: string;
  timesPerWeek: number;
  sessionMinutes: number;
  /** True once the person changed how often or how long: choosing another category then keeps both. */
  oftenTouched: boolean;
  place: PlaceChoice;
  /** The typed address, used with { kind: "address" }. */
  address: string;
  /** null: not answered yet; "any": any time. */
  dayPart: DayPart | "any" | "custom" | null;
  /** The own window ("Custom"): minutes after midnight, used with dayPart "custom". */
  customFrom: number;
  customUntil: number;
  /** Sorted, Monday = 1. */
  avoidDays: Weekday[];
  /** The days it happens on for sure: sorted, at most one per session a week, never a day off. */
  mustDays: Weekday[];
  /** null: not answered yet; true: there is a date; false: no end date. */
  hasDate: boolean | null;
  /** "YYYY-MM-DD" or "" while none is chosen. */
  deadline: string;
  color: GoalColorName;
  icon: GoalIconName;
  /** True once the person chose an icon on the review: choosing another category then keeps it. */
  iconTouched: boolean;
  autoBlock: boolean;
  why: string;
};

/** What each category starts with: how often, how long and its icon. */
export const CATEGORY_START: Record<GoalCategory, { timesPerWeek: number; sessionMinutes: number; icon: GoalIconName }> = {
  sport: { timesPerWeek: 3, sessionMinutes: 60, icon: "dumbbell" },
  uni: { timesPerWeek: 4, sessionMinutes: 90, icon: "graduation" },
  work: { timesPerWeek: 3, sessionMinutes: 90, icon: "briefcase" },
  personal: { timesPerWeek: 3, sessionMinutes: 60, icon: "heart" },
  other: { timesPerWeek: 2, sessionMinutes: 60, icon: "rocket" },
};

/** The line under each category's card. */
export const CATEGORY_LINES: Record<GoalCategory, string> = {
  sport: "Training, running, the gym",
  uni: "Studying, exams, a thesis",
  work: "A job, a project, a side business",
  personal: "Reading, music, people, rest",
  other: "Anything else",
};

/** Name ideas that fill the name field. */
export const NAME_IDEAS: Record<GoalCategory, string[]> = {
  sport: ["Gym", "Running", "Half marathon"],
  uni: ["Study for exams", "Thesis"],
  work: ["Side project", "Deep work"],
  personal: ["Reading", "Guitar"],
  other: [],
};

/** The session lengths offered as chips; any other length, to the minute, through "Custom". */
export const SESSION_CHIPS = [30, 45, 60, 120] as const;

/** A chip's words: "30 min", "1 h", "2 h". */
export function chipLength(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : fmtWeekly(minutes);
}

/** The custom wheel goes up to 12:00: at 12 hours the minutes stay at 0. 0:00 stays visible but blocks Continue. */
export const WHEEL_MAX_MINUTES = MAX_SESSION_MINUTES;

/** Why the custom length cannot be taken, or null. */
export function sessionLengthProblem(minutes: number): string | null {
  if (minutes < MIN_SESSION_MINUTES) return "Choose at least 1 minute.";
  if (minutes > MAX_SESSION_MINUTES) return "A session can be at most 12 hours.";
  return null;
}

/** The quick dates of the last question: in 4, 8 and 12 weeks. */
export const DATE_CHIPS = [4, 8, 12] as const;

export const MAX_TITLE = 80;
export const MAX_WHY = 200;
export const MIN_TIMES = 1;
export const MAX_TIMES = 7;

/** The answers before anything is chosen. `color` is the goal's starting colour (the first unused one). */
export function emptyAnswers(color: GoalColorName): SetupAnswers {
  return {
    category: null,
    title: "",
    categoryOther: "",
    timesPerWeek: CATEGORY_START.other.timesPerWeek,
    sessionMinutes: CATEGORY_START.other.sessionMinutes,
    oftenTouched: false,
    place: { kind: "home" },
    address: "",
    dayPart: null,
    customFrom: 7 * 60,
    customUntil: 8 * 60,
    avoidDays: [],
    mustDays: [],
    hasDate: null,
    deadline: "",
    color,
    icon: "rocket",
    iconTouched: false,
    autoBlock: false,
    why: "",
  };
}

/** Whether anything was answered yet (closing then asks "Discard this goal?"). */
export function hasAnswers(answers: SetupAnswers): boolean {
  return (
    answers.category !== null ||
    answers.title.trim() !== "" ||
    answers.oftenTouched ||
    answers.place.kind !== "home" ||
    answers.dayPart !== null ||
    answers.avoidDays.length > 0 ||
    answers.mustDays.length > 0 ||
    answers.hasDate !== null
  );
}

/**
 * Chooses a category: its starting values for how often and how long (unless the person changed them)
 * and its icon (unless the person chose one). The times never exceed the days left.
 */
export function chooseCategory(answers: SetupAnswers, category: GoalCategory): SetupAnswers {
  const start = CATEGORY_START[category];
  return {
    ...answers,
    category,
    timesPerWeek: answers.oftenTouched ? answers.timesPerWeek : Math.min(start.timesPerWeek, maxTimesPerWeek(answers)),
    sessionMinutes: answers.oftenTouched ? answers.sessionMinutes : start.sessionMinutes,
    icon: answers.iconTouched ? answers.icon : start.icon,
  };
}

// ---------- How often, and the days left (one session a day at most) ----------

/** The days that are not ruled out. */
export function daysLeft(answers: Pick<SetupAnswers, "avoidDays">): number {
  return 7 - answers.avoidDays.length;
}

/** The most sessions a week: seven, and never more than the days left (one a day). */
export function maxTimesPerWeek(answers: Pick<SetupAnswers, "avoidDays">): number {
  return Math.min(MAX_TIMES, daysLeft(answers));
}

/** Sets the times a week, kept between 1 and the most that fit. */
export function setTimesPerWeek(answers: SetupAnswers, times: number): SetupAnswers {
  const next = Math.max(MIN_TIMES, Math.min(maxTimesPerWeek(answers), Math.round(times)));
  return { ...answers, timesPerWeek: next, oftenTouched: true };
}

/** Sets the session length to the minute, as the wheel shows it: 0:00 (refused by stepProblem) to 12:00, never more. */
export function setSessionMinutes(answers: SetupAnswers, minutes: number): SetupAnswers {
  const next = Math.max(0, Math.min(WHEEL_MAX_MINUTES, Math.round(minutes)));
  return { ...answers, sessionMinutes: next, oftenTouched: true };
}

/** "At least one day has to stay": the sentence when the last free day is tapped. */
export const LAST_DAY_MESSAGE = "At least one day has to stay";

/** Whether a day can be ruled out now: never the last free day. */
export function canRuleOut(answers: Pick<SetupAnswers, "avoidDays">, day: Weekday): boolean {
  return answers.avoidDays.includes(day) || daysLeft(answers) > 1;
}

/**
 * Rules a day out or frees it again. The last free day cannot be ruled out: then the answers stay as
 * they are and `refused` holds the sentence to show.
 */
export function toggleAvoidDay(answers: SetupAnswers, day: Weekday): { answers: SetupAnswers; refused: string | null } {
  // A sure day cannot be a day off (the screen shows it greyed out).
  if (answers.mustDays.includes(day)) return { answers, refused: MUST_IS_OFF_MESSAGE };
  if (answers.avoidDays.includes(day)) {
    return { answers: { ...answers, avoidDays: answers.avoidDays.filter((d) => d !== day) }, refused: null };
  }
  if (!canRuleOut(answers, day)) return { answers, refused: LAST_DAY_MESSAGE };
  const avoidDays = [...answers.avoidDays, day].sort((a, b) => a - b);
  return { answers: { ...answers, avoidDays }, refused: null };
}

/** The sentence when a sure day is tapped below, as a day off. */
export const MUST_IS_OFF_MESSAGE = "This is one of your sure days";

/** The sentence when one sure day too many is tapped: never more than the sessions a week. */
export function tooManyMustDays(times: number): string {
  return times === 1 ? "You plan 1 session a week, so you can choose 1 sure day." : `You plan ${times} sessions a week, so you can choose up to ${times} sure days.`;
}

/**
 * Makes a day a sure day or frees it again. A day off cannot be one (the screen greys it out), and
 * never more sure days than sessions a week: then the answers stay and `refused` holds the sentence.
 */
export function toggleMustDay(answers: SetupAnswers, day: Weekday): { answers: SetupAnswers; refused: string | null } {
  if (answers.mustDays.includes(day)) {
    return { answers: { ...answers, mustDays: answers.mustDays.filter((d) => d !== day) }, refused: null };
  }
  if (answers.avoidDays.includes(day)) return { answers, refused: "This day is off limits. Free it below first." };
  if (answers.mustDays.length >= answers.timesPerWeek) return { answers, refused: tooManyMustDays(answers.timesPerWeek) };
  const mustDays = [...answers.mustDays, day].sort((a, b) => a - b);
  return { answers: { ...answers, mustDays }, refused: null };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** Q5's blocking sentence when the planned sessions do not fit the days left, else null. */
export function daysProblem(answers: Pick<SetupAnswers, "avoidDays" | "timesPerWeek"> & { mustDays?: readonly Weekday[] }): string | null {
  const must = answers.mustDays?.length ?? 0;
  if (must > answers.timesPerWeek) {
    return `You chose ${plural(must, "sure day", "sure days")} but plan ${plural(answers.timesPerWeek, "session", "sessions")} a week. Unpick a day, or go back and plan more.`;
  }
  const left = daysLeft(answers);
  if (left < 1) return LAST_DAY_MESSAGE;
  if (answers.timesPerWeek <= left) return null;
  const days = left === 1 ? "only 1 day is left" : `only ${left} days are left`;
  return `You planned ${plural(answers.timesPerWeek, "session", "sessions")} a week, but ${days}. Free a day, or go back and plan fewer.`;
}

// ---------- Whether "Continue" is possible ----------

/** The place's address as it is saved, or null for "at home or anywhere" (and for an empty typed address). */
export function locationOf(answers: Pick<SetupAnswers, "place" | "address">): string | null {
  const text = answers.place.kind === "saved" ? answers.place.address.trim() : answers.place.kind === "address" ? answers.address.trim() : "";
  return text === "" ? null : text;
}

/**
 * Why "Continue" is not possible on this question, or null when it is. `today` is the person's local
 * date (the date of the last question cannot be in the past).
 */
export function stepProblem(step: SetupStep, answers: SetupAnswers, today: LocalDate): string | null {
  switch (step) {
    case "category": {
      if (answers.category === null) return "Choose what this goal is about.";
      const length = [...answers.title.trim()].length;
      if (length === 0) return "Give your goal a name.";
      if (length > MAX_TITLE) return MESSAGES.goalTitleLength;
      const other = routineProblem({ ...noRoutine, category: answers.category, categoryOther: answers.categoryOther }, []);
      return other?.message ?? null;
    }
    case "often": {
      const times = answers.timesPerWeek;
      if (!Number.isInteger(times) || times < MIN_TIMES || times > MAX_TIMES) return "Choose 1 to 7 times a week.";
      const length = sessionLengthProblem(answers.sessionMinutes);
      if (length) return length;
      const minutes = routineProblem({ ...noRoutine, sessionMinutes: answers.sessionMinutes }, []);
      if (minutes) return minutes.message;
      // Only after going back from a later question: the days ruled out leave fewer days than planned.
      return times > daysLeft(answers) || times < answers.mustDays.length ? daysProblem(answers) : null;
    }
    case "place": {
      const location = locationOf(answers);
      return location !== null && [...location].length > MAX_LOCATION ? MESSAGES.locationLength : null;
    }
    case "when":
      if (answers.dayPart === null) return "Choose a time of day, or Any time.";
      return answers.dayPart === "custom" ? customWindowProblem(answers) : null;
    case "days":
      return daysProblem(answers);
    case "date":
      if (answers.hasDate === null) return "Choose whether you are working towards a date.";
      if (answers.hasDate && answers.deadline === "") return "Choose the date.";
      if (answers.hasDate && answers.deadline < today) return MESSAGES.deadlinePast;
      if (answers.hasDate && freeDaysUntil(answers, today) === 0) {
        return `Every day until ${fmtDayMonth(answers.deadline)} is ruled out. Choose a later date, or free a day.`;
      }
      return null;
  }
}

const noRoutine = { category: null, categoryOther: null, sessionMinutes: null, dayPart: null, avoidDays: null, location: null };

/** The first question whose answer does not pass yet, or null when the goal can be reviewed. */
export function firstProblemStep(answers: SetupAnswers, today: LocalDate): SetupStep | null {
  return SETUP_STEPS.find((step) => stepProblem(step, answers, today) !== null) ?? null;
}

/** Monday = 1 to Sunday = 7, for a "YYYY-MM-DD". */
function weekdayOf(date: LocalDate): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  return (((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1) as Weekday;
}

/**
 * The days from today to the date (both counted) that are not ruled out, counted up to 7 (after a
 * week every weekday has come once). 0 when there is no date.
 */
export function freeDaysUntil(answers: Pick<SetupAnswers, "avoidDays" | "deadline">, today: LocalDate): number {
  if (answers.deadline === "" || answers.deadline < today) return 0;
  let free = 0;
  for (let day = today, n = 0; day <= answers.deadline && n < 7; day = addDays(day, 1), n++) {
    if (!answers.avoidDays.includes(weekdayOf(day))) free++;
  }
  return free;
}

/** A date less than a week away that leaves fewer free days than the sessions planned for a week (it never blocks). */
export function dateHint(answers: SetupAnswers, today: LocalDate): string | null {
  if (!answers.hasDate || answers.deadline === "" || answers.deadline < today) return null;
  if (addDays(today, 6) <= answers.deadline) return null;
  const free = freeDaysUntil(answers, today);
  if (free === 0 || free >= answers.timesPerWeek) return null;
  return `Until ${fmtDayMonth(answers.deadline)} there ${free === 1 ? "is 1 free day" : `are ${free} free days`} for ${plural(answers.timesPerWeek, "session", "sessions")}.`;
}

/** Why the own window ("Custom") cannot be taken, or null: the end after the start, room for one session. */
export function customWindowProblem(answers: Pick<SetupAnswers, "customFrom" | "customUntil" | "sessionMinutes">): string | null {
  if (answers.customUntil <= answers.customFrom) return "The end has to be after the start.";
  if (answers.customUntil - answers.customFrom < answers.sessionMinutes) {
    return `The time window is shorter than one session (${fmtWeekly(answers.sessionMinutes)}).`;
  }
  return null;
}

/**
 * Opens "Custom" with a window inside the visible hours: from the day's first hour (or 7:00 when the
 * day starts earlier), as long as one session and at least an hour, never past the day's end.
 */
export function startCustom(answers: SetupAnswers, display: DisplayLike & { dayStartHour: number }): SetupAnswers {
  const first = display.dayStartHour * 60;
  const last = display.dayEndHour * 60;
  const from = Math.min(Math.max(first, 7 * 60), last - 60);
  const until = Math.min(last, from + Math.max(60, answers.sessionMinutes));
  return { ...answers, dayPart: "custom", customFrom: from, customUntil: until };
}

/** The quick dates: today plus 4, 8 or 12 weeks. */
export function dateIn(today: LocalDate, weeks: number): LocalDate {
  return addDays(today, weeks * 7);
}

// ---------- The quiet hints (they never block) ----------

export const ONE_GOAL_HINT_HOURS = 20;
export const ALL_GOALS_HINT_HOURS = 40;

/** 180 → "3 h", 135 → "2 h 15 min", 45 → "45 min". */
export function fmtWeekly(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** 21 hours as "21 hours", 20 h 15 min as "20 h 15 min". */
function fmtHours(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} hours` : fmtWeekly(minutes);
}

/** Q2's sum: "3 × 60 min = 3 h a week". */
export function weeklySum(answers: Pick<SetupAnswers, "timesPerWeek" | "sessionMinutes">): string {
  return `${answers.timesPerWeek} × ${answers.sessionMinutes} min = ${fmtWeekly(answers.timesPerWeek * answers.sessionMinutes)} a week`;
}

/** More than 20 hours a week for this one goal. */
export function oneGoalHint(answers: Pick<SetupAnswers, "timesPerWeek" | "sessionMinutes">): string | null {
  const minutes = answers.timesPerWeek * answers.sessionMinutes;
  if (minutes <= ONE_GOAL_HINT_HOURS * 60) return null;
  return `That is ${fmtHours(minutes)} a week for one goal. Make sure it fits.`;
}

/** The parts of the person's display settings the hints need. */
export type DisplayLike = { timeFormat: TimeFormat; dayEndHour: number };

/** In the evening, a session that starts at 17:00 and runs past the calendar's last visible hour. */
export function eveningHint(answers: Pick<SetupAnswers, "dayPart" | "sessionMinutes">, display: DisplayLike): string | null {
  if (answers.dayPart !== "evening") return null;
  const start = DAY_PART_HOURS.evening.from * 60;
  if (start + answers.sessionMinutes <= display.dayEndHour * 60) return null;
  return `A ${fmtWeekly(answers.sessionMinutes)} session from ${fmtTime(start, display.timeFormat)} runs past ${fmtHourSetting(display.dayEndHour, display.timeFormat)}, the end of your visible day.`;
}

/** How long a saved goal asks for each week: a count rule times its session length (60 minutes without one), an hours rule as it is. */
export function goalWeeklyMinutes(goal: { rules: readonly { kind: "count" | "hours"; target: number }[]; routine?: GoalRoutine | null }): number {
  const session = goal.routine?.sessionMinutes ?? 60;
  return goal.rules.reduce((sum, rule) => sum + (rule.kind === "count" ? rule.target * session : rule.target * 60), 0);
}

/** All goals together (the saved ones and this one) come to more than 40 hours a week. */
export function allGoalsHint(answers: Pick<SetupAnswers, "timesPerWeek" | "sessionMinutes">, goals: readonly Parameters<typeof goalWeeklyMinutes>[0][]): string | null {
  const total = answers.timesPerWeek * answers.sessionMinutes + goals.reduce((sum, goal) => sum + goalWeeklyMinutes(goal), 0);
  if (total <= ALL_GOALS_HINT_HOURS * 60) return null;
  return `All your goals together come to ${fmtHours(total)} a week.`;
}

// ---------- What is sent ----------

/** The body of create_goal, exactly as the questions send it: one count rule and the routine. */
export type CreateGoalBody = {
  title: string;
  deadline: LocalDate | null;
  autoBlock: boolean;
  color: GoalColorName;
  icon: GoalIconName;
  why: string;
  rules: { kind: "count"; target: number; minMinutes: null }[];
  category: GoalCategory | null;
  categoryOther: string | null;
  sessionMinutes: number;
  dayPart: DayPart | null;
  dayFrom: number | null;
  dayUntil: number | null;
  avoidDays: Weekday[];
  mustDays: Weekday[];
  location: string | null;
};

export function createGoalBody(answers: SetupAnswers): CreateGoalBody {
  const other = answers.categoryOther.trim();
  return {
    title: answers.title.trim(),
    deadline: answers.hasDate ? answers.deadline : null,
    autoBlock: answers.autoBlock,
    color: answers.color,
    icon: answers.icon,
    why: answers.why.trim(),
    rules: [{ kind: "count", target: answers.timesPerWeek, minMinutes: null }],
    category: answers.category,
    categoryOther: answers.category === "other" && other !== "" ? other : null,
    sessionMinutes: answers.sessionMinutes,
    dayPart: answers.dayPart === "any" || answers.dayPart === "custom" ? null : answers.dayPart,
    dayFrom: answers.dayPart === "custom" ? answers.customFrom : null,
    dayUntil: answers.dayPart === "custom" ? answers.customUntil : null,
    avoidDays: [...answers.avoidDays].sort((a, b) => a - b),
    mustDays: [...answers.mustDays].sort((a, b) => a - b),
    location: locationOf(answers),
  };
}

/** The routine the answers describe (for the tags and the sentence). */
export function answersRoutine(answers: SetupAnswers): GoalRoutine {
  const body = createGoalBody(answers);
  return {
    category: body.category,
    categoryOther: body.categoryOther,
    sessionMinutes: body.sessionMinutes,
    dayPart: body.dayPart,
    avoidDays: body.avoidDays,
    mustDays: body.mustDays,
    dayFrom: body.dayFrom,
    dayUntil: body.dayUntil,
    location: body.location,
  };
}

// ---------- The tags and the sentence ----------

export type TagKey = "category" | "often" | "minutes" | "dayPart" | "sure" | "days" | "place" | "date";

/** One small tag: what it shows, what a screen reader hears, and the question it belongs to. */
export type RoutineTag = { key: TagKey; text: string; label: string; step: SetupStep };

/** The question each tag (and each line of the review) belongs to, for "Change". */
export const STEP_OF_TAG: Record<TagKey, SetupStep> = {
  category: "category",
  often: "often",
  minutes: "often",
  dayPart: "when",
  sure: "days",
  days: "days",
  place: "place",
  date: "date",
};

/** When each part of the day is, in the person's time format: "After 5pm" or "After 17:00". */
export function dayPartTimes(part: DayPart, format: TimeFormat): string {
  const { from, until } = DAY_PART_HOURS[part];
  if (from === 0) return `Before ${fmtTime(until * 60, format)}`;
  if (until === 24) return `After ${fmtTime(from * 60, format)}`;
  return fmtRange(from * 60, until * 60, format);
}

const DAY_PART_PLURAL: Record<DayPart, string> = { morning: "Mornings", afternoon: "Afternoons", evening: "Evenings" };

const dayShort = (day: Weekday) => WEEKDAYS[day - 1].short;
const dayLong = (day: Weekday) => WEEKDAYS[day - 1].long;

/** "Friday", "Friday and Saturday", "Monday, Friday and Sunday" (the given form of each day). */
function listOf(words: string[], last = "and"): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} ${last} ${words[words.length - 1]}`;
}

/** The year of a date as shown: "Dec 12, 2026". */
export function fmtDateWithYear(date: LocalDate): string {
  return `${fmtDayMonth(date)}, ${date.slice(0, 4)}`;
}

/** The category's name: the own word with "other" when there is one. */
export function categoryName(routine: Pick<GoalRoutine, "category" | "categoryOther">): string | null {
  if (routine.category === null) return null;
  return routine.category === "other" && routine.categoryOther ? routine.categoryOther : GOAL_CATEGORY_LABELS[routine.category];
}

export type TagInput = {
  routine: GoalRoutine;
  /** The count rule's times a week; left out, no "3× a week" tag. */
  timesPerWeek?: number | null;
  /** The deadline, or null for no end date; left out (undefined), no date tag. */
  deadline?: LocalDate | null;
  /** The category's name as the first tag (the goal card). */
  withCategory?: boolean;
  /** How times are shown (an own window); left out: 12-hour. */
  format?: TimeFormat;
};

/** The tags of a routine, only what is set: how often, how long, when, the days, the place, the date. */
export function routineTags(input: TagInput, format: TimeFormat): RoutineTag[] {
  const { routine } = input;
  const tags: RoutineTag[] = [];
  const add = (key: TagKey, text: string, label = text) => tags.push({ key, text, label, step: STEP_OF_TAG[key] });
  const category = categoryName(routine);
  if (input.withCategory && category !== null) add("category", category, `Category: ${category}`);
  if (input.timesPerWeek) add("often", `${input.timesPerWeek}× a week`, `${timesWords(input.timesPerWeek)} a week`);
  if (routine.sessionMinutes !== null) add("minutes", routine.sessionMinutes > 120 ? fmtWeekly(routine.sessionMinutes) : `${routine.sessionMinutes} min`, `${routine.sessionMinutes} minutes each`);
  if (routine.dayFrom !== null && routine.dayUntil !== null) {
    const window = fmtRange(routine.dayFrom, routine.dayUntil, format);
    add("dayPart", window, `Between ${window}`);
  }
  if (routine.dayPart !== null) {
    add("dayPart", DAY_PART_PLURAL[routine.dayPart], `${DAY_PART_PLURAL[routine.dayPart]}, ${dayPartTimes(routine.dayPart, format).toLowerCase()}`);
  }
  if (routine.mustDays.length > 0) {
    add("sure", `On ${routine.mustDays.map(dayShort).join(", ")}`, `Always on ${listOf(routine.mustDays.map(dayLong))}`);
  }
  if (routine.avoidDays.length > 0) {
    add("days", `Not ${routine.avoidDays.map(dayShort).join(", ")}`, `Never on ${listOf(routine.avoidDays.map(dayLong))}`);
  }
  if (routine.location !== null) add("place", routine.location, `At ${routine.location}`);
  if (input.deadline !== undefined) {
    if (input.deadline === null) add("date", "No end date");
    else add("date", `Until ${fmtDayMonth(input.deadline)}`, `Until ${fmtDateWithYear(input.deadline)}`);
  }
  return tags;
}

/** The tags of the goal taking shape: only the questions already reached (or answered) count. */
export function previewTags(answers: SetupAnswers, reached: SetupStep, format: TimeFormat): RoutineTag[] {
  const upTo = SETUP_STEPS.indexOf(reached);
  const routine = answersRoutine(answers);
  const shown: GoalRoutine = {
    ...EMPTY_ROUTINE,
    sessionMinutes: upTo >= 1 ? routine.sessionMinutes : null,
    location: upTo >= 2 ? routine.location : null,
    dayPart: upTo >= 3 ? routine.dayPart : null,
    dayFrom: upTo >= 3 ? routine.dayFrom : null,
    dayUntil: upTo >= 3 ? routine.dayUntil : null,
    avoidDays: upTo >= 4 ? routine.avoidDays : [],
    mustDays: upTo >= 4 ? routine.mustDays : [],
  };
  const deadline = upTo >= 5 && answers.hasDate !== null ? (answers.hasDate ? answers.deadline || undefined : null) : undefined;
  return routineTags({ routine: shown, timesPerWeek: upTo >= 1 ? answers.timesPerWeek : null, deadline }, format);
}

/** "Once", "Twice", "3 times". */
function timesWords(times: number): string {
  return times === 1 ? "Once" : times === 2 ? "Twice" : `${times} times`;
}

/** "60 minutes", "2 hours", "2 h 30 min". */
function sessionWords(minutes: number): string {
  if (minutes <= 120) return `${minutes} minutes`;
  return minutes % 60 === 0 ? `${minutes / 60} hours` : fmtWeekly(minutes);
}

const DAY_PART_WORDS: Record<DayPart, string> = { morning: "in the morning", afternoon: "in the afternoon", evening: "in the evening" };

/** One line of the review, with the question it belongs to. */
export type SummaryLine = { step: SetupStep; label: string; text: string };

/** The review's lines: how often, where, when, the days and the date (the name sits above them). */
export function summaryLines(answers: SetupAnswers, format: TimeFormat = "12h"): SummaryLine[] {
  const routine = answersRoutine(answers);
  const days = answers.avoidDays;
  const sure = answers.mustDays;
  const dayParts = [
    ...(sure.length > 0 ? [`Always on ${listOf(sure.map((d) => `${dayLong(d)}s`))}`] : []),
    ...(days.length > 0 ? [`${sure.length > 0 ? "never" : "Never"} on ${listOf(days.map((d) => `${dayLong(d)}s`), "or")}`] : []),
  ];
  return [
    { step: "often", label: "How often", text: `${timesWords(answers.timesPerWeek)} a week, ${sessionWords(answers.sessionMinutes)} each` },
    { step: "place", label: "Where", text: routine.location ?? "At home or anywhere" },
    {
      step: "when",
      label: "When",
      text:
        routine.dayFrom !== null && routine.dayUntil !== null
          ? fmtRange(routine.dayFrom, routine.dayUntil, format)
          : routine.dayPart === null
            ? "Any time of day"
            : capitalise(DAY_PART_WORDS[routine.dayPart]),
    },
    { step: "days", label: "Days", text: dayParts.length === 0 ? "Every day works" : dayParts.join(", ") },
    { step: "date", label: "Until", text: answers.hasDate && answers.deadline ? fmtDateWithYear(answers.deadline) : "No end date" },
  ];
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The routine in one sentence: "3 times a week, 60 minutes each, in the evening, never on Fridays, at
 * FitnessHut Lisboa, until Dec 12, 2026". Only what is set; `deadline` undefined leaves the date out.
 */
export function routineSentence(input: TagInput): string {
  const { routine } = input;
  const parts: string[] = [];
  if (input.timesPerWeek) parts.push(`${timesWords(input.timesPerWeek)} a week`);
  if (routine.sessionMinutes !== null) parts.push(input.timesPerWeek ? `${sessionWords(routine.sessionMinutes)} each` : `${sessionWords(routine.sessionMinutes)} a session`);
  if (routine.dayPart !== null) parts.push(DAY_PART_WORDS[routine.dayPart]);
  if (routine.dayFrom !== null && routine.dayUntil !== null) parts.push(`between ${fmtRange(routine.dayFrom, routine.dayUntil, input.format ?? "12h")}`);
  if (routine.mustDays.length > 0) parts.push(`always on ${listOf(routine.mustDays.map((d) => `${dayLong(d)}s`))}`);
  if (routine.avoidDays.length > 0) parts.push(`never on ${listOf(routine.avoidDays.map((d) => `${dayLong(d)}s`), "or")}`);
  if (routine.location !== null) parts.push(`at ${routine.location}`);
  if (input.deadline !== undefined) parts.push(input.deadline === null ? "with no end date" : `until ${fmtDateWithYear(input.deadline)}`);
  return capitalise(parts.join(", "));
}

/** The review's sentence for the answers. */
export function answersSentence(answers: SetupAnswers, format: TimeFormat = "12h"): string {
  return routineSentence({
    format,
    routine: answersRoutine(answers),
    timesPerWeek: answers.timesPerWeek,
    deadline: answers.hasDate ? answers.deadline || undefined : null,
  });
}
