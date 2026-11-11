// Goal colours, taken over from the first prototype. The ontology has no colour field, so a goal's
// colour is calculated from its place in the user's list (oldest first) and never saved.
// Every class name is written out in full, so Tailwind finds it.

export type GoalColor = {
  /** Event block: background, border and text. */
  block: string;
  /** Time under the title in a block. */
  subtext: string;
  /** A small dot or swatch. */
  dot: string;
  /** A soft tile behind an icon or a label. */
  tile: string;
  /** Name of the colour, for screen readers where the colour alone would carry meaning. */
  name: string;
};

const PALETTE: GoalColor[] = [
  { block: "bg-rose-50 border-rose-200 text-rose-900", subtext: "text-rose-800", dot: "bg-rose-500", tile: "bg-rose-50 text-rose-700", name: "rose" },
  { block: "bg-teal-50 border-teal-200 text-teal-900", subtext: "text-teal-800", dot: "bg-teal-500", tile: "bg-teal-50 text-teal-700", name: "teal" },
  { block: "bg-violet-50 border-violet-200 text-violet-900", subtext: "text-violet-800", dot: "bg-violet-500", tile: "bg-violet-50 text-violet-700", name: "violet" },
  { block: "bg-amber-50 border-amber-200 text-amber-900", subtext: "text-amber-800", dot: "bg-amber-500", tile: "bg-amber-50 text-amber-800", name: "amber" },
  { block: "bg-sky-50 border-sky-200 text-sky-900", subtext: "text-sky-800", dot: "bg-sky-500", tile: "bg-sky-50 text-sky-700", name: "sky" },
  { block: "bg-lime-50 border-lime-200 text-lime-900", subtext: "text-lime-800", dot: "bg-lime-600", tile: "bg-lime-50 text-lime-800", name: "lime" },
];

/** The colour of the goal at `index` in the user's list (0 = oldest). After six goals the colours repeat. */
export function goalColor(index: number): GoalColor {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
}
