// The colour of a person's shared calendar on the viewer's screen (spec 53, colours since 19 Nov 2026).
// Each shown person gets one of three colours, so two people's blocks can be told apart at a glance; the
// "People" menu shows the same colour as a dot beside the name. None of the three is a goal colour
// (src/lib/goals/colors.ts), and a shared block has a bar at its left edge and the person's avatar, so
// it is never taken for one of the viewer's own events. Pure functions, no React.
// Every class name is written out in full, so Tailwind finds it.

export type ShareColorName = "blue" | "purple" | "green";
export const SHARE_COLOR_NAMES: readonly ShareColorName[] = ["blue", "purple", "green"];

export type ShareColor = {
  /** A shared block, chip or row: the bar's colour, the fill and the text. */
  block: string;
  /** The time beside or under the title. */
  subtext: string;
  /** The dot beside the person's name in the "People" menu and on the card. */
  dot: string;
  /** Name of the colour, for screen readers where the colour alone would carry meaning. */
  name: string;
};

const PALETTE: Record<ShareColorName, ShareColor> = {
  blue: { block: "border-blue-500 bg-blue-100 text-blue-950", subtext: "text-blue-900", dot: "bg-blue-500", name: "blue" },
  purple: { block: "border-purple-500 bg-purple-100 text-purple-950", subtext: "text-purple-900", dot: "bg-purple-500", name: "purple" },
  green: { block: "border-green-600 bg-green-100 text-green-950", subtext: "text-green-900", dot: "bg-green-500", name: "green" },
};

/** The class names of one colour. */
export function shareColor(name: ShareColorName): ShareColor {
  return PALETTE[name];
}

/** The colour a person gets when nobody else has taken it: always the same for the same person. */
export function preferredColor(userId: string): ShareColorName {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) % 9973;
  return SHARE_COLOR_NAMES[hash % SHARE_COLOR_NAMES.length];
}

/**
 * The colour of each shown person, in the order they were chosen: their own colour, or the next free
 * one when an earlier person already has it. With at most three people shown (R58) no two share one.
 */
export function shareColors(chosen: readonly string[]): Record<string, ShareColorName> {
  const colors: Record<string, ShareColorName> = {};
  const taken = new Set<ShareColorName>();
  for (const userId of chosen) {
    // A person listed twice keeps the colour of their first place.
    if (colors[userId]) continue;
    const start = SHARE_COLOR_NAMES.indexOf(preferredColor(userId));
    let name = SHARE_COLOR_NAMES[start];
    for (let step = 0; step < SHARE_COLOR_NAMES.length && taken.has(name); step++) {
      name = SHARE_COLOR_NAMES[(start + step + 1) % SHARE_COLOR_NAMES.length];
    }
    colors[userId] = name;
    taken.add(name);
  }
  return colors;
}
