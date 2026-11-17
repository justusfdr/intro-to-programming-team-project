// The shape of a goal as the server sends it to the page.
import type { GoalProgress, RuleKind } from "./progress";
import type { GoalRoutine } from "./routine";
import type { GoalColorName, GoalIconName, GoalLook } from "./style";

export type RuleDto = { id: string; kind: RuleKind; target: number; minMinutes: number | null };

export type GoalDto = {
  id: string;
  title: string;
  /** The last day, "2027-03-14", or null: the goal has no end date (spec 41). */
  deadline: string | null;
  autoBlock: boolean;
  /** The saved colour, or null: then the colour comes from the goal's place in the list (`look`). */
  color: GoalColorName | null;
  icon: GoalIconName;
  /** "Why it matters", or "". */
  why: string;
  /** Sent back with every edit and delete, so the server can see whether the goal changed since (R4). */
  updatedAt: string;
  rules: RuleDto[];
  /**
   * What the goal says about itself (spec 41): present only when something of it is set, so a goal
   * without a routine looks exactly as before.
   */
  routine?: GoalRoutine;
};

/** A goal as the panel shows it: the goal, its look and its calculated progress. */
export type GoalView = GoalDto & {
  /** Place in the user's list, oldest first; picks the colour when none is saved (src/lib/goals/style.ts). */
  colorIndex: number;
  /** The colour and icon to show: the saved ones, else the calculated colour. */
  look: GoalLook;
  progress: GoalProgress;
};
