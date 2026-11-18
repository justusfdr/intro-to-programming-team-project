// How far a goal's rules are this week, as one number from 0 to 1, for the thin bar under a goal
// in the goals column. Calculated from the progress the server already sends, never saved.
// Pure, no React.
import type { RuleProgress } from "./progress";

/**
 * One rule's share of its target this week. A met rule is full. Otherwise the share comes from the
 * rule's own words, "This week: 1 of 2 done" or "This week: 3.5 of 6 h" (ruleText in progress.ts),
 * so the bar always agrees with the text next to it.
 */
export function ruleShare(rule: Pick<RuleProgress, "text" | "status">): number {
  if (rule.status === "met") return 1;
  const match = /(\d+(?:\.\d+)?) of (\d+(?:\.\d+)?)/.exec(rule.text);
  if (!match) return 0;
  const amount = Number(match[1]);
  const target = Number(match[2]);
  if (!(target > 0)) return 0;
  return Math.min(1, Math.max(0, amount / target));
}

/** Above this many circles a rule shows only its text and the bar; more would crowd the card. */
export const MAX_CIRCLES = 10;

/**
 * The circles under a rule this week (R9): one per session of a count rule ("2 of 6 done"), one per
 * hour of an hours rule ("1.5 of 6 h"). Each number is how full that circle is, from 0 to 1; a part
 * of an hour fills its circle partly. A met rule is all full. Read from the rule's own words, like
 * ruleShare, so the circles always agree with the text. Null when there is nothing to draw: no target
 * in the text, or more than MAX_CIRCLES circles.
 */
export function ruleCircles(rule: Pick<RuleProgress, "text" | "status">): number[] | null {
  const match = /(\d+(?:\.\d+)?) of (\d+(?:\.\d+)?)/.exec(rule.text);
  if (!match) return null;
  const amount = Number(match[1]);
  const target = Number(match[2]);
  const count = Math.ceil(target);
  if (!(count > 0) || count > MAX_CIRCLES) return null;
  const done = rule.status === "met" ? target : Math.min(amount, target);
  return Array.from({ length: count }, (_, i) => {
    // The last circle of a target like 3.5 h stands for half an hour, so half an hour fills it.
    const size = Math.min(1, target - i);
    return Math.min(1, Math.max(0, (done - i) / size));
  });
}

/** The average share of all rules, 0 when the goal has none. */
export function weekShare(rules: Pick<RuleProgress, "text" | "status">[]): number {
  if (rules.length === 0) return 0;
  return rules.reduce((sum, rule) => sum + ruleShare(rule), 0) / rules.length;
}

/**
 * The numbers in a rule's words, "This week: 1 of 2 done" or "This week: 3.5 of 6 h" (ruleText in
 * progress.ts): what is done, the target and whether it counts hours. Null for other words.
 */
export function ruleNumbers(text: string): { amount: string; target: string; hours: boolean } | null {
  const match = /(\d+(?:\.\d+)?) of (\d+(?:\.\d+)?)( h)?/.exec(text);
  if (!match) return null;
  return { amount: match[1], target: match[2], hours: match[3] !== undefined };
}
