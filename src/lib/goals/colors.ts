// The class names for each of the ten goal colours (src/lib/goals/style.ts), taken over from the first
// prototype. The text shades are one step darker than the prototype's, as on main, so text on the
// pale tints keeps enough contrast. Every class name is written out in full, so Tailwind finds it.
import type { GoalColorName } from "./style";

export type GoalColor = {
  /** Event block: background, border and text. */
  block: string;
  /** Time under the title in a block. */
  subtext: string;
  /** A small dot or swatch (the colour dots in the goal editor, bars). */
  dot: string;
  /** A soft tile behind an icon or a label. */
  tile: string;
  /** The border of an open ring (a rule not met yet) in the goals column. */
  ring: string;
  /** The progress ring of a running focus session. */
  stroke: string;
  /** Text in the goal's colour (the icon in the focus ring). */
  text: string;
  /** Name of the colour, for screen readers where the colour alone would carry meaning. */
  name: string;
};

const PALETTE: Record<GoalColorName, GoalColor> = {
  rose: { block: "bg-rose-50 border-rose-200 text-rose-900", subtext: "text-rose-800", dot: "bg-rose-500", tile: "bg-rose-50 text-rose-700", ring: "border-rose-500", stroke: "stroke-rose-500", text: "text-rose-600", name: "rose" },
  teal: { block: "bg-teal-50 border-teal-200 text-teal-900", subtext: "text-teal-800", dot: "bg-teal-500", tile: "bg-teal-50 text-teal-700", ring: "border-teal-500", stroke: "stroke-teal-500", text: "text-teal-600", name: "teal" },
  indigo: { block: "bg-indigo-50 border-indigo-200 text-indigo-900", subtext: "text-indigo-800", dot: "bg-indigo-500", tile: "bg-indigo-50 text-indigo-700", ring: "border-indigo-500", stroke: "stroke-indigo-500", text: "text-indigo-600", name: "indigo" },
  amber: { block: "bg-amber-50 border-amber-200 text-amber-900", subtext: "text-amber-800", dot: "bg-amber-500", tile: "bg-amber-50 text-amber-800", ring: "border-amber-500", stroke: "stroke-amber-500", text: "text-amber-600", name: "amber" },
  emerald: { block: "bg-emerald-50 border-emerald-200 text-emerald-900", subtext: "text-emerald-800", dot: "bg-emerald-500", tile: "bg-emerald-50 text-emerald-700", ring: "border-emerald-500", stroke: "stroke-emerald-500", text: "text-emerald-600", name: "green" },
  pink: { block: "bg-pink-50 border-pink-200 text-pink-900", subtext: "text-pink-800", dot: "bg-pink-500", tile: "bg-pink-50 text-pink-700", ring: "border-pink-500", stroke: "stroke-pink-500", text: "text-pink-600", name: "pink" },
  sky: { block: "bg-sky-50 border-sky-200 text-sky-900", subtext: "text-sky-800", dot: "bg-sky-500", tile: "bg-sky-50 text-sky-700", ring: "border-sky-500", stroke: "stroke-sky-500", text: "text-sky-600", name: "sky" },
  violet: { block: "bg-violet-50 border-violet-200 text-violet-900", subtext: "text-violet-800", dot: "bg-violet-500", tile: "bg-violet-50 text-violet-700", ring: "border-violet-500", stroke: "stroke-violet-500", text: "text-violet-600", name: "violet" },
  orange: { block: "bg-orange-50 border-orange-200 text-orange-900", subtext: "text-orange-800", dot: "bg-orange-500", tile: "bg-orange-50 text-orange-700", ring: "border-orange-500", stroke: "stroke-orange-500", text: "text-orange-600", name: "orange" },
  slate: { block: "bg-slate-50 border-slate-200 text-slate-900", subtext: "text-slate-800", dot: "bg-slate-500", tile: "bg-slate-50 text-slate-700", ring: "border-slate-500", stroke: "stroke-slate-500", text: "text-slate-600", name: "slate" },
};

/** The class names of one goal colour. */
export function goalColor(color: GoalColorName): GoalColor {
  return PALETTE[color];
}
