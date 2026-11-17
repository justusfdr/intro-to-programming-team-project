// Where each widget sits in the 3 × 6 grid, and whether a list of widgets may be saved (R47).
// The grid fills from the top: each widget takes the first place where it fits, so a small widget
// after a wide one fills the hole beside an earlier small one. There are never gaps the user did not
// make, and the same list always lands in the same places.
import { GRID_COLUMNS, GRID_ROWS, MAX_CITY_LENGTH, SIZES_OF, WIDGET_KINDS, WIDGET_SIZES, type WidgetItem, type WidgetKind, type WidgetSize } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Width and height of a size, in fields. */
export function sizeOf(size: WidgetSize): { w: number; h: number } {
  const [w, h] = size.split("x").map(Number);
  return { w, h };
}

export type Placement = { index: number; row: number; col: number; w: number; h: number };

/**
 * The places of the widgets in a grid of `rows` rows. A widget that finds no place is left out
 * (`hidden`): the list is longer than the grid, or the sidebar is too short for all rows.
 */
export function pack(layout: WidgetItem[], rows: number = GRID_ROWS): { placed: Placement[]; hidden: number[] } {
  const taken: boolean[][] = Array.from({ length: Math.max(0, rows) }, () => Array(GRID_COLUMNS).fill(false));
  const free = (row: number, col: number, w: number, h: number) => {
    if (row + h > rows || col + w > GRID_COLUMNS) return false;
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) if (taken[r][c]) return false;
    return true;
  };
  const placed: Placement[] = [];
  const hidden: number[] = [];
  layout.forEach((item, index) => {
    const { w, h } = sizeOf(item.size);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < GRID_COLUMNS; col++) {
        if (!free(row, col, w, h)) continue;
        for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) taken[r][c] = true;
        placed.push({ index, row, col, w, h });
        return;
      }
    }
    hidden.push(index);
  });
  return { placed, hidden };
}

/** Whether one more widget of this size still fits after the others. */
export function fitsWith(layout: WidgetItem[], item: WidgetItem): boolean {
  return pack([...layout, item]).hidden.length === 0;
}

export type LayoutCheck = { ok: true; layout: WidgetItem[] } | { ok: false; message: string };

export const LAYOUT_MESSAGES = {
  notAList: "Widgets must be a list",
  unknownKind: "Choose a widget from the list",
  wrongSize: "This widget does not come in that size",
  badGoal: "Choose one of your goals",
  tooMany: "The widgets do not fit. Remove one first",
  badCity: "A city must be 1 to 80 characters on one line",
} as const;

/**
 * R47: a list of widgets may be saved when every widget is one of the six kinds, in one of its sizes,
 * only a goal widget names a goal (an id, or none for "the first goal"), only a weather widget names a
 * city (1 to 80 characters on one line, or none: it follows the user), and all of them fit in the 3 × 6
 * grid together. Anything else is refused as a whole.
 */
export function checkLayout(value: unknown): LayoutCheck {
  if (!Array.isArray(value) || value.length > GRID_COLUMNS * GRID_ROWS) {
    return { ok: false, message: Array.isArray(value) ? LAYOUT_MESSAGES.tooMany : LAYOUT_MESSAGES.notAList };
  }
  const layout: WidgetItem[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return { ok: false, message: LAYOUT_MESSAGES.notAList };
    const { kind, size, goalId, city, ...rest } = entry as Record<string, unknown>;
    if (Object.keys(rest).length > 0) return { ok: false, message: LAYOUT_MESSAGES.notAList };
    if (!(WIDGET_KINDS as readonly unknown[]).includes(kind)) return { ok: false, message: LAYOUT_MESSAGES.unknownKind };
    const k = kind as WidgetKind;
    if (!(WIDGET_SIZES as readonly unknown[]).includes(size) || !SIZES_OF[k].includes(size as WidgetSize)) {
      return { ok: false, message: LAYOUT_MESSAGES.wrongSize };
    }
    if (k !== "weather" && city !== undefined && city !== null) return { ok: false, message: LAYOUT_MESSAGES.badCity };
    if (k === "weather") {
      if (goalId !== undefined && goalId !== null) return { ok: false, message: LAYOUT_MESSAGES.badGoal };
      if (city === undefined || city === null) {
        layout.push({ kind: k, size: size as WidgetSize });
        continue;
      }
      const name = typeof city === "string" ? city.trim() : "";
      if (name === "" || name.length > MAX_CITY_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) return { ok: false, message: LAYOUT_MESSAGES.badCity };
      layout.push({ kind: k, size: size as WidgetSize, city: name });
    } else if (k === "goal") {
      if (goalId !== undefined && goalId !== null && !(typeof goalId === "string" && UUID.test(goalId))) {
        return { ok: false, message: LAYOUT_MESSAGES.badGoal };
      }
      layout.push({ kind: k, size: size as WidgetSize, goalId: (goalId as string | null | undefined) ?? null });
    } else {
      if (goalId !== undefined && goalId !== null) return { ok: false, message: LAYOUT_MESSAGES.badGoal };
      layout.push({ kind: k, size: size as WidgetSize });
    }
  }
  if (pack(layout).hidden.length > 0) return { ok: false, message: LAYOUT_MESSAGES.tooMany };
  return { ok: true, layout };
}

/** How many full rows fit in a height of `px` (fields of 64 px with 8 px between them), at most 6. */
export function rowsFor(px: number, cell = 64, gap = 8): number {
  return Math.max(0, Math.min(GRID_ROWS, Math.floor((px + gap) / (cell + gap))));
}
