import "server-only";

// The checks shared by create_goal and edit_goal (ontology section 5, R7), in the ontology's order:
// title, at least one rule, the deadline, then each rule. Each throws the ontology's message.
import { z } from "zod";
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

/** The body shape. At most 10 rules: more makes no sense for a weekly goal and keeps the body small. */
export const GoalFields = z.object({
  title: z.string().max(1000),
  deadline: z.string().max(10),
  autoBlock: z.boolean().optional(),
  rules: z.array(RuleFields).max(10),
});

export type CheckedRule = { id?: string; kind: "count" | "hours"; target: number; minMinutes: number | null };
export type CheckedGoal = { title: string; deadline: LocalDate; autoBlock: boolean; rules: CheckedRule[] };

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
 * Checks the fields. `today` is the user's local date. When editing, `keptDeadline` is the goal's
 * current deadline: it may stay as it is even if it has passed ("not past when set or changed").
 */
export function checkGoalFields(
  fields: z.infer<typeof GoalFields>,
  today: LocalDate,
  keptDeadline?: LocalDate,
): CheckedGoal {
  const title = fields.title.trim();
  const titleLength = [...title].length;
  if (titleLength < 1 || titleLength > 80) throw new ActionError(400, "title_length", MESSAGES.goalTitleLength);

  if (fields.rules.length === 0) throw new ActionError(400, "no_rule", MESSAGES.addRule);

  if (!isLocalDate(fields.deadline)) throw new ActionError(400, "bad_request", MESSAGES.badRequest);
  if (fields.deadline < today && fields.deadline !== keptDeadline) {
    throw new ActionError(400, "deadline_past", MESSAGES.deadlinePast);
  }

  return { title, deadline: fields.deadline, autoBlock: fields.autoBlock ?? false, rules: fields.rules.map(checkRule) };
}
