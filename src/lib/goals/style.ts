// A goal's look, taken over from the first prototype: ten colours and ten icons by the same names,
// with their names for screen readers. The database checks the same two lists (goals_color, goals_icon).
// A goal saved without a colour (every goal the main branch creates) gets the colour calculated from
// its place in the list, oldest first, as on main.

export const GOAL_COLORS = ["rose", "teal", "indigo", "amber", "emerald", "pink", "sky", "violet", "orange", "slate"] as const;
export type GoalColorName = (typeof GOAL_COLORS)[number];

export const GOAL_ICON_NAMES = [
  "rocket",
  "footprints",
  "heart",
  "video",
  "book",
  "dumbbell",
  "briefcase",
  "graduation",
  "palette",
  "code",
] as const;
export type GoalIconName = (typeof GOAL_ICON_NAMES)[number];

/** English names of the colours (for aria-label and tooltips), as in the prototype. */
export const GOAL_COLOR_LABELS: Record<GoalColorName, string> = {
  rose: "Rose",
  teal: "Teal",
  indigo: "Indigo",
  amber: "Amber",
  emerald: "Green",
  pink: "Pink",
  sky: "Sky",
  violet: "Violet",
  orange: "Orange",
  slate: "Slate",
};

/** English names of the icons (for aria-label), as in the prototype. */
export const GOAL_ICON_LABELS: Record<GoalIconName, string> = {
  rocket: "Rocket",
  footprints: "Footprints",
  heart: "Heart",
  video: "Video",
  book: "Book",
  dumbbell: "Dumbbell",
  briefcase: "Briefcase",
  graduation: "Graduation cap",
  palette: "Palette",
  code: "Code",
};

/** The icon of a goal that never chose one (the database's default, the prototype's default). */
export const DEFAULT_GOAL_ICON: GoalIconName = "rocket";

/** What every place that shows a goal needs: its colour and icon, never empty. */
export type GoalLook = { color: GoalColorName; icon: GoalIconName };

/**
 * The colours main calculates from the order (rose, teal, violet, amber, sky, lime). Lime is not one
 * of the ten, so green stands in for it.
 */
const CALCULATED: GoalColorName[] = ["rose", "teal", "violet", "amber", "sky", "emerald"];

export function isGoalColor(value: unknown): value is GoalColorName {
  return typeof value === "string" && (GOAL_COLORS as readonly string[]).includes(value);
}

export function isGoalIcon(value: unknown): value is GoalIconName {
  return typeof value === "string" && (GOAL_ICON_NAMES as readonly string[]).includes(value);
}

/** The colour of the goal at `index` in the user's list (0 = oldest) when it has none saved. */
export function calculatedColor(index: number): GoalColorName {
  return CALCULATED[((index % CALCULATED.length) + CALCULATED.length) % CALCULATED.length];
}

/** A goal's look: its saved colour, else the calculated one; its icon, else the default. */
export function lookOf(goal: { color: string | null; icon: string }, index: number): GoalLook {
  return {
    color: isGoalColor(goal.color) ? goal.color : calculatedColor(index),
    icon: isGoalIcon(goal.icon) ? goal.icon : DEFAULT_GOAL_ICON,
  };
}

/** The colour a new goal starts with, as in the prototype: the first unused of the ten, else the least used. */
export function nextGoalColor(used: GoalColorName[]): GoalColorName {
  let least: GoalColorName = GOAL_COLORS[0];
  let leastCount = Infinity;
  for (const color of GOAL_COLORS) {
    const count = used.filter((c) => c === color).length;
    if (count < leastCount) {
      least = color;
      leastCount = count;
    }
  }
  return least;
}
