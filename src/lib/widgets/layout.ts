// Where each widget sits in the 3 × 6 grid, and whether a list of widgets may be saved (R47).
// A widget the user has put in a field (`at`, by dragging it there) keeps that field while it is on this
// screen and free. The others fill from the top: each takes the first place where it fits, so a small
// widget after a wide one fills the hole beside an earlier small one. There are never gaps the user did
// not make, and the same list always lands in the same places.
import { GRID_COLUMNS, GRID_ROWS, MAX_CITY_LENGTH, SIZES_OF, WIDGET_KINDS, WIDGET_SIZES, type WidgetCellAt, type WidgetItem, type WidgetKind, type WidgetSize } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Width and height of a size, in fields. */
export function sizeOf(size: WidgetSize): { w: number; h: number } {
  const [w, h] = size.split("x").map(Number);
  return { w, h };
}

export type Placement = { index: number; row: number; col: number; w: number; h: number };

/**
 * The places of the widgets in a grid of `rows` rows: first the widgets put in a field, in that field
 * (the first in the list wins a field two want; one whose field is not on this screen flows like the
 * others), then the others from the top. A widget that finds no place is left out (`hidden`): the list
 * is longer than the grid, or the sidebar is too short for all rows.
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
  const take = (index: number, row: number, col: number, w: number, h: number) => {
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) taken[r][c] = true;
    placed.push({ index, row, col, w, h });
  };
  const fixed = new Set<number>();
  layout.forEach((item, index) => {
    if (!item.at) return;
    const { w, h } = sizeOf(item.size);
    if (!free(item.at.row, item.at.col, w, h)) return;
    take(index, item.at.row, item.at.col, w, h);
    fixed.add(index);
  });
  layout.forEach((item, index) => {
    if (fixed.has(index)) return;
    const { w, h } = sizeOf(item.size);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < GRID_COLUMNS; col++) {
        if (!free(row, col, w, h)) continue;
        take(index, row, col, w, h);
        return;
      }
    }
    hidden.push(index);
  });
  placed.sort((a, b) => a.index - b.index);
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
  badField: "Put the widget in a field of the grid",
} as const;

/**
 * R47: a list of widgets may be saved when every widget is one of the six kinds, in one of its sizes,
 * only a goal widget names a goal (an id, or none for "the first goal"), only a weather widget names a
 * city (1 to 80 characters on one line, or none: it follows the user), a field it was put in is one of the
 * grid's (row 0 to 5, column 0 to 2), and all of them fit in the 3 × 6 grid together. Anything else is
 * refused as a whole.
 */
export function checkLayout(value: unknown): LayoutCheck {
  if (!Array.isArray(value) || value.length > GRID_COLUMNS * GRID_ROWS) {
    return { ok: false, message: Array.isArray(value) ? LAYOUT_MESSAGES.tooMany : LAYOUT_MESSAGES.notAList };
  }
  const layout: WidgetItem[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return { ok: false, message: LAYOUT_MESSAGES.notAList };
    const { kind, size, goalId, city, at, ...rest } = entry as Record<string, unknown>;
    if (Object.keys(rest).length > 0) return { ok: false, message: LAYOUT_MESSAGES.notAList };
    const field = fieldOf(at);
    if (field === false) return { ok: false, message: LAYOUT_MESSAGES.badField };
    const where = field ? { at: field } : {};
    if (!(WIDGET_KINDS as readonly unknown[]).includes(kind)) return { ok: false, message: LAYOUT_MESSAGES.unknownKind };
    const k = kind as WidgetKind;
    if (!(WIDGET_SIZES as readonly unknown[]).includes(size) || !SIZES_OF[k].includes(size as WidgetSize)) {
      return { ok: false, message: LAYOUT_MESSAGES.wrongSize };
    }
    if (k !== "weather" && city !== undefined && city !== null) return { ok: false, message: LAYOUT_MESSAGES.badCity };
    if (k === "weather") {
      if (goalId !== undefined && goalId !== null) return { ok: false, message: LAYOUT_MESSAGES.badGoal };
      if (city === undefined || city === null) {
        layout.push({ kind: k, size: size as WidgetSize, ...where });
        continue;
      }
      const name = typeof city === "string" ? city.trim() : "";
      if (name === "" || name.length > MAX_CITY_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) return { ok: false, message: LAYOUT_MESSAGES.badCity };
      layout.push({ kind: k, size: size as WidgetSize, city: name, ...where });
    } else if (k === "goal") {
      if (goalId !== undefined && goalId !== null && !(typeof goalId === "string" && UUID.test(goalId))) {
        return { ok: false, message: LAYOUT_MESSAGES.badGoal };
      }
      layout.push({ kind: k, size: size as WidgetSize, goalId: (goalId as string | null | undefined) ?? null, ...where });
    } else {
      if (goalId !== undefined && goalId !== null) return { ok: false, message: LAYOUT_MESSAGES.badGoal };
      layout.push({ kind: k, size: size as WidgetSize, ...where });
    }
  }
  if (pack(layout).hidden.length > 0) return { ok: false, message: LAYOUT_MESSAGES.tooMany };
  return { ok: true, layout };
}

/** A field of the grid as saved: none, a field ({ row 0–5, col 0–2 }), or false for anything else. */
function fieldOf(value: unknown): WidgetCellAt | null | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const { row, col, ...rest } = value as Record<string, unknown>;
  const whole = (n: unknown, max: number) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < max;
  if (Object.keys(rest).length > 0 || !whole(row, GRID_ROWS) || !whole(col, GRID_COLUMNS)) return false;
  return { row: row as number, col: col as number };
}

/** How many full rows fit in a height of `px` (fields of 64 px with 8 px between them), at most 6. */
export function rowsFor(px: number, cell = 64, gap = 8): number {
  return Math.max(0, Math.min(GRID_ROWS, Math.floor((px + gap) / (cell + gap))));
}

/** The widget without the field it was put in: it takes the first free place again. */
function loose(item: WidgetItem): WidgetItem {
  const { at: _field, ...rest } = item;
  void _field;
  return rest;
}

/** Every widget on this screen put in the field it is in now, so moving another one does not move it. */
export function pinned(layout: WidgetItem[], rows: number): WidgetItem[] {
  const { placed } = pack(layout, rows);
  return layout.map((item, i) => {
    const p = placed.find((x) => x.index === i);
    return p ? { ...item, at: { row: p.row, col: p.col } } : item;
  });
}

/** The widget in another size; one put in a field stays in its row and moves left as far as it must. */
export function resized(item: WidgetItem, size: WidgetSize): WidgetItem {
  if (!item.at) return { ...item, size };
  return { ...item, size, at: { row: item.at.row, col: Math.min(item.at.col, GRID_COLUMNS - sizeOf(size).w) } };
}

/**
 * `layout` with `item` put in the field `cell` of the screen's first `rows` rows (its top left there), when
 * it is dragged there or added from a "+" field. Every other widget on this screen stays where it is (it
 * keeps that field from now on); one it covers moves to the next free place. Where that would leave a widget
 * out of the full 3 × 6 grid (R47) or push one off this screen, the nearest field that does not is taken.
 * Returns the new list and where the widget is in it (first); null: there is no room anywhere.
 */
export function placeAt(layout: WidgetItem[], item: WidgetItem, rows: number, cell: WidgetCellAt): { layout: WidgetItem[]; index: number } | null {
  const { w, h } = sizeOf(item.size);
  if (rows < h) return null;
  const hiddenBefore = pack(layout, rows).hidden.length;
  const stay = pinned(layout, rows);
  const fields: WidgetCellAt[] = [];
  for (let row = 0; row + h <= rows; row++) for (let col = 0; col + w <= GRID_COLUMNS; col++) fields.push({ row, col });
  const target = { row: Math.min(Math.max(cell.row, 0), rows - h), col: Math.min(Math.max(cell.col, 0), GRID_COLUMNS - w) };
  const distance = (f: WidgetCellAt) => Math.abs(f.row - target.row) * GRID_COLUMNS + Math.abs(f.col - target.col);
  fields.sort((a, b) => distance(a) - distance(b));
  for (const at of fields) {
    const covers = (other: WidgetItem) => {
      if (!other.at) return false;
      const o = sizeOf(other.size);
      return other.at.row < at.row + h && at.row < other.at.row + o.h && other.at.col < at.col + w && at.col < other.at.col + o.w;
    };
    const list = [{ ...item, at }, ...stay.map((other) => (covers(other) ? loose(other) : other))];
    if (pack(list).hidden.length > 0) continue;
    if (pack(list, rows).hidden.length > hiddenBefore) continue;
    return { layout: list, index: 0 };
  }
  return null;
}

/** `layout` with the widget at `index` moved one field in a direction (the arrow keys), or null: it cannot. */
export function nudge(layout: WidgetItem[], index: number, rows: number, by: { row: number; col: number }): WidgetItem[] | null {
  const place = pack(layout, rows).placed.find((p) => p.index === index);
  if (!place) return null;
  const cell = { row: place.row + by.row, col: place.col + by.col };
  if (cell.row < 0 || cell.col < 0 || cell.row + place.h > rows || cell.col + place.w > GRID_COLUMNS) return null;
  const rest = pinned(layout, rows).filter((_, i) => i !== index);
  const moved = placeAt(rest, layout[index], rows, cell);
  if (!moved) return null;
  const landed = pack(moved.layout, rows).placed.find((p) => p.index === moved.index);
  return landed && landed.row === cell.row && landed.col === cell.col ? moved.layout : null;
}
