// Which widgets the Analytics page shows on which tab (spec 49, "Edit widgets"), and whether a layout
// may be saved. Pure functions: the dialog uses them to say "No room" at once, the server uses the same
// ones before it saves (save_analytics_widgets), so both always agree.
//
// A tab is a grid of 4 columns and 2 rows. Every widget is one row high and 1, 2 or 3 columns wide
// (S, M, L). The widgets are placed in the order of the list, each in the first row that still has
// room for it, exactly as the page does it (a grid that fills holes). A list fits when no widget
// needs a third row.
import {
  FIELDS_OF,
  GRID_COLUMNS,
  GRID_ROWS,
  SIZES,
  STANDARD_LAYOUT,
  TABS,
  WIDGETS,
  type AnalyticsLayout,
  type Size,
  type Tab,
  type WidgetItem,
  type WidgetKind,
} from "./report-types";

export const LAYOUT_MESSAGES = {
  notALayout: "Widgets must be a list for each tab",
  unknownKind: "Choose a widget from the list",
  wrongTab: "This widget does not belong on that tab",
  wrongSize: "This widget does not come in that size",
  twice: "A widget can be on a tab only once",
  noRoom: "No room on this tab. Remove or shrink a widget first",
} as const;

/** Widgets a tab may show besides those of its own topic. */
const ALSO_ON: Partial<Record<Tab, readonly WidgetKind[]>> = { streaks: ["goal_streaks"] };

/** The Overview may show any widget; every other tab the widgets of its topic (and the few named above). */
export function allowedOn(tab: Tab, kind: WidgetKind): boolean {
  if (tab === "overview") return true;
  return WIDGETS[kind].topic === tab || (ALSO_ON[tab]?.includes(kind) ?? false);
}

/** Every widget a tab may show, in the order of the catalogue. */
export function widgetsFor(tab: Tab): WidgetKind[] {
  return (Object.keys(WIDGETS) as WidgetKind[]).filter((kind) => allowedOn(tab, kind));
}

/** The sizes a widget comes in; the first is its standard size. */
export function sizesOf(kind: WidgetKind): readonly Size[] {
  return WIDGETS[kind].sizes;
}

/** How many rows the list needs when each widget takes the first row with room for it. */
export function rowsNeeded(items: readonly WidgetItem[]): number {
  const free: number[] = [];
  for (const item of items) {
    const width = FIELDS_OF[item.size];
    const row = free.findIndex((left) => left >= width);
    if (row === -1) free.push(GRID_COLUMNS - width);
    else free[row] -= width;
  }
  return free.length;
}

/** Whether the widgets of one tab fit on one screen. */
export function fits(items: readonly WidgetItem[]): boolean {
  return rowsNeeded(items) <= GRID_ROWS;
}

export type LayoutCheck = { ok: true; layout: AnalyticsLayout } | { ok: false; message: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks a layout that came from outside (the browser, or the saved value). It must name exactly the
 * six tabs, each with a list of widgets; every widget one the tab may show, in one of its sizes, at
 * most once per tab; and each tab must fit in its 4 × 2 fields. Anything else is refused as a whole.
 */
export function checkLayout(value: unknown): LayoutCheck {
  if (!isPlainObject(value)) return { ok: false, message: LAYOUT_MESSAGES.notALayout };
  const keys = Object.keys(value);
  if (keys.length !== TABS.length || !TABS.every((tab) => Array.isArray(value[tab]))) return { ok: false, message: LAYOUT_MESSAGES.notALayout };

  const layout = {} as AnalyticsLayout;
  for (const tab of TABS) {
    const items: WidgetItem[] = [];
    const seen = new Set<string>();
    for (const raw of value[tab] as unknown[]) {
      if (!isPlainObject(raw) || Object.keys(raw).length !== 2) return { ok: false, message: LAYOUT_MESSAGES.unknownKind };
      const { kind, size } = raw;
      if (typeof kind !== "string" || !Object.hasOwn(WIDGETS, kind)) return { ok: false, message: LAYOUT_MESSAGES.unknownKind };
      const known = kind as WidgetKind;
      if (!allowedOn(tab, known)) return { ok: false, message: LAYOUT_MESSAGES.wrongTab };
      if (typeof size !== "string" || !(SIZES as readonly string[]).includes(size) || !sizesOf(known).includes(size as Size)) {
        return { ok: false, message: LAYOUT_MESSAGES.wrongSize };
      }
      if (seen.has(known)) return { ok: false, message: LAYOUT_MESSAGES.twice };
      seen.add(known);
      items.push({ kind: known, size: size as Size });
    }
    if (!fits(items)) return { ok: false, message: LAYOUT_MESSAGES.noRoom };
    layout[tab] = items;
  }
  return { ok: true, layout };
}

/** A copy of the standard layout (so nobody changes the shared one by accident). */
export function standardLayout(): AnalyticsLayout {
  const copy = {} as AnalyticsLayout;
  for (const tab of TABS) copy[tab] = STANDARD_LAYOUT[tab].map((item) => ({ ...item }));
  return copy;
}

/**
 * The layout to show for a saved value: the saved one when it still passes the check, else the standard
 * one (nothing saved, or saved before a widget was renamed or removed).
 */
export function layoutOf(saved: unknown): { layout: AnalyticsLayout; isStandard: boolean } {
  if (saved !== null && saved !== undefined) {
    const checked = checkLayout(saved);
    if (checked.ok) return { layout: checked.layout, isStandard: false };
  }
  return { layout: standardLayout(), isStandard: true };
}
