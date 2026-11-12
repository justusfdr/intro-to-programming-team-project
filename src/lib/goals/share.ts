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

/** The average share of all rules, 0 when the goal has none. */
export function weekShare(rules: Pick<RuleProgress, "text" | "status">[]): number {
  if (rules.length === 0) return 0;
  return rules.reduce((sum, rule) => sum + ruleShare(rule), 0) / rules.length;
}
