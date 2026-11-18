import "server-only";

// The checks shared by create_goal and edit_goal (ontology section 5, R7), in the ontology's order:
// title, at least one rule, the deadline, then each rule, then the look (colour, icon, why it matters),
// then the routine (spec 41, R44: category, own word, session length, part of the day, avoided days,
// location, and whether the week still fits). Each throws the ontology's message.
import { z } from "zod";
import { cleanRoutine, EMPTY_ROUTINE, routineProblem, type GoalRoutine, type RoutineInput, type Weekday } from "@/lib/goals/routine";
import { isGoalColor, isGoalIcon, type GoalColorName, type GoalIconName } from "@/lib/goals/style";
import { MESSAGES } from "@/lib/messages";
import { ActionError } from "@/lib/server/errors";
import { isLocalDate, type LocalDate } from "@/lib/time/zoned";

const RuleFields = z.object({
  /** Only when editing: the rule being changed. New rules have none. */
  id: z.string().max(40).optional(),
  kind: z.enum(["count", "hours"]),
  target: z.number(),
  minMinutes: z.number().nullable().optional(),
});

/**
 * The body shape. At most 10 rules: more makes no sense for a weekly goal and keeps the body small.
 * Colour, icon and why are optional: left out, a new goal gets the defaults and an edit keeps them.
 * A colour of null means "calculated from the goal's place in the list".
 * A deadline of null means "no end date" (spec 41). The routine's fields (spec 41) are optional in the
 * same way: left out, a new goal gets none and an edit keeps the saved value; null (or an empty list of
 * days) clears it. The strings are capped generously; the checks below give the exact limits.
 */
export const GoalFields = z.object({
  title: z.string().max(1000),
  deadline: z.string().max(10).nullable(),
  autoBlock: z.boolean().optional(),
  rules: z.array(RuleFields).max(10),
  color: z.string().max(40).nullable().optional(),
  icon: z.string().max(40).optional(),
  why: z.string().max(2000).optional(),
  category: z.string().max(40).nullable().optional(),
  categoryOther: z.string().max(1000).nullable().optional(),
  sessionMinutes: z.number().nullable().optional(),
  dayPart: z.string().max(40).nullable().optional(),
  avoidDays: z.array(z.number()).max(7).nullable().optional(),
  mustDays: z.array(z.number()).max(7).nullable().optional(),
  dayFrom: z.number().nullable().optional(),
  dayUntil: z.number().nullable().optional(),
  location: z.string().max(1000).nullable().optional(),
});

/**
 * Spec 41: an open-ended goal keeps a placeholder in the deadline column (it stays "not null" for older
 * versions of the app): the user's today plus this many days, written when the goal becomes open-ended.
 */
export const OPEN_ENDED_PLACEHOLDER_DAYS = 364;

/** R35: "Why it matters" is at most 200 characters. */
const MAX_WHY = 200;

export type CheckedRule = { id?: string; kind: "count" | "hours"; target: number; minMinutes: number | null };
export type CheckedGoal = {
  title: string;
  /** null: no end date (the action writes the placeholder, spec 41). */
  deadline: LocalDate | null;
  autoBlock: boolean;
  rules: CheckedRule[];
  /** undefined: not sent (an edit keeps the saved value, a new goal gets the default). */
  color: GoalColorName | null | undefined;
  icon: GoalIconName | undefined;
  why: string | undefined;
  /** The routine as it will be saved: the sent fields over the kept (or empty) ones, cleaned. */
  routine: GoalRoutine;
};

/** What an edit keeps when the body leaves something out. */
export type KeptGoal = {
  /** The current deadline; undefined for an open-ended goal (its placeholder is not a deadline). */
  deadline: LocalDate | undefined;
  routine: GoalRoutine;
};

function checkRule(rule: z.infer<typeof RuleFields>): CheckedRule {
  const minMinutes = rule.minMinutes ?? null;
  if (rule.kind === "count") {
    if (!Number.isInteger(rule.target) || rule.target < 1 || rule.target > 14) {
      throw new ActionError(400, "count_target", MESSAGES.countTarget);
    }
    if (minMinutes !== null && (!Number.isInteger(minMinutes) || minMinutes < 15 || minMinutes > 240)) {
      throw new ActionError(400, "min_minutes", MESSAGES.minMinutes);
    }
  } else {
    // Steps of 0.5 hours (R7).
    if (rule.target < 0.5 || rule.target > 60 || !Number.isInteger(rule.target * 2)) {
      throw new ActionError(400, "hours_target", MESSAGES.hoursTarget);
    }
    // A minimum length belongs to count rules only; the form never sends one for hours.
    if (minMinutes !== null) throw new ActionError(400, "bad_request", MESSAGES.badRequest);
  }
  return { id: rule.id, kind: rule.kind, target: rule.target, minMinutes };
}

/**
 * Checks the fields. `today` is the user's local date. When editing, `kept` holds the goal's current
 * deadline (it may stay as it is even if it has passed: "not past when set or changed") and its saved
 * routine (the fields the body leaves out keep their values).
 */
export function checkGoalFields(fields: z.infer<typeof GoalFields>, today: LocalDate, kept?: KeptGoal): CheckedGoal {
  const title = fields.title.trim();
  const titleLength = [...title].length;
  if (titleLength < 1 || titleLength > 80) throw new ActionError(400, "title_length", MESSAGES.goalTitleLength);

  if (fields.rules.length === 0) throw new ActionError(400, "no_rule", MESSAGES.addRule);

  // null: no end date (spec 41). A date is checked as before.
  if (fields.deadline !== null) {
    if (!isLocalDate(fields.deadline)) throw new ActionError(400, "bad_request", MESSAGES.badRequest);
    if (fields.deadline < today && fields.deadline !== kept?.deadline) {
      throw new ActionError(400, "deadline_past", MESSAGES.deadlinePast);
    }
  }

  const rules = fields.rules.map(checkRule);

  if (fields.color !== undefined && fields.color !== null && !isGoalColor(fields.color)) {
    throw new ActionError(400, "goal_color", MESSAGES.goalColor);
  }
  if (fields.icon !== undefined && !isGoalIcon(fields.icon)) throw new ActionError(400, "goal_icon", MESSAGES.goalIcon);
  const why = fields.why?.trim();
  if (why !== undefined && [...why].length > MAX_WHY) throw new ActionError(400, "why_length", MESSAGES.whyLength);

  // The routine as it will be after the action: what the body sends, else what is kept (R44 checks
  // the goal's new rules against the days it will have).
  const base = kept?.routine ?? EMPTY_ROUTINE;
  const routineInput: RoutineInput = {
    category: fields.category !== undefined ? fields.category : base.category,
    categoryOther: fields.categoryOther !== undefined ? fields.categoryOther : base.categoryOther,
    sessionMinutes: fields.sessionMinutes !== undefined ? fields.sessionMinutes : base.sessionMinutes,
    dayPart: fields.dayPart !== undefined ? fields.dayPart : base.dayPart,
    avoidDays: fields.avoidDays !== undefined ? fields.avoidDays : base.avoidDays,
    // Kept sure days give way to an edit that only sends other fields: a day now ruled out is dropped,
    // and with fewer times a week the last ones go (the goal editor does not show the sure days).
    mustDays: fields.mustDays !== undefined ? fields.mustDays : keptMustDays(base.mustDays, fields.avoidDays ?? base.avoidDays, rules),
    location: fields.location !== undefined ? fields.location : base.location,
    // The own window: as sent; else kept, unless a part of the day (or Any time) was sent instead.
    ...(fields.dayFrom !== undefined || fields.dayUntil !== undefined
      ? { dayFrom: fields.dayFrom ?? null, dayUntil: fields.dayUntil ?? null }
      : fields.dayPart !== undefined
        ? { dayFrom: null, dayUntil: null }
        : { dayFrom: base.dayFrom, dayUntil: base.dayUntil }),
  };
  const problem = routineProblem(routineInput, rules);
  if (problem) throw new ActionError(400, problem.error, problem.message);

  return {
    title,
    deadline: fields.deadline,
    autoBlock: fields.autoBlock ?? false,
    rules,
    color: fields.color as GoalColorName | null | undefined,
    icon: fields.icon as GoalIconName | undefined,
    why,
    routine: cleanRoutine(routineInput),
  };
}

/** The saved sure days that still fit: none ruled out, at most one per session of the count rule. */
function keptMustDays(must: readonly Weekday[], avoid: readonly number[], rules: readonly CheckedRule[]): Weekday[] {
  const count = rules.find((r) => r.kind === "count");
  const left = must.filter((d) => !avoid.includes(d));
  return count ? left.slice(0, count.target) : left;
}
