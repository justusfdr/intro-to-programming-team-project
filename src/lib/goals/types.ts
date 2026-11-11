// The shape of a goal as the server sends it to the page.
import type { GoalProgress, RuleKind } from "./progress";

export type RuleDto = { id: string; kind: RuleKind; target: number; minMinutes: number | null };

export type GoalDto = {
  id: string;
  title: string;
  /** The last day, "2027-03-14". */
  deadline: string;
  autoBlock: boolean;
  /** Sent back with every edit and delete, so the server can see whether the goal changed since (R4). */
  updatedAt: string;
  rules: RuleDto[];
};

/** A goal as the panel shows it: the goal, its calculated colour and its calculated progress. */
export type GoalView = GoalDto & {
  /** Place in the user's list, oldest first; picks the colour (src/lib/goals/colors.ts). */
  colorIndex: number;
  progress: GoalProgress;
};
