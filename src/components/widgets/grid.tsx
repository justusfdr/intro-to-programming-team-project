// The grid of widgets without any state (spec 45): which tile a widget is, and the cell it sits in, with
// the minus and the size tag while editing. WidgetArea holds the state and passes everything in; the
// preview tool renders the same pieces with sample data.
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import { Minus } from "lucide-react";
import type { Placement } from "@/lib/widgets/layout";
import { CELL_PX, GAP_PX, GRID_COLUMNS, SIZES_OF, WIDGET_NAMES, type WidgetItem, type WidgetsData } from "@/lib/widgets/types";
import type { WeatherAnswer } from "@/lib/widgets/weather";
import { FocusWidget, FreeWidget, GoalWidget, LeaveWidget, NextWidget, WeatherWidget, type Clock, type TripTravel } from "./tiles";

/** What the tiles are drawn from. */
export type WidgetContext = {
  data: WidgetsData;
  weather: WeatherAnswer | null;
  /** Offered while the browser has not been asked for the location (R47). */
  onLocate?: () => void;
  travel: TripTravel;
  clock: Clock;
};

/** The tile of one widget. While editing nothing inside reacts (no links, no location button). */
export function renderWidget(item: WidgetItem, ctx: WidgetContext, editing: boolean): ReactNode {
  const { data, clock } = ctx;
  switch (item.kind) {
    case "weather":
      return <WeatherWidget size={item.size} answer={ctx.weather} clock={clock} onLocate={editing ? undefined : ctx.onLocate} />;
    case "next":
      return (
        <NextWidget
          size={item.size}
          next={data.next}
          after={data.after}
          tomorrow={data.tomorrow}
          travel={data.next && data.trip && data.next.id === data.trip.id ? ctx.travel : null}
          clock={clock}
        />
      );
    case "leave":
      return <LeaveWidget size={item.size} trip={data.trip} travel={ctx.travel} clock={clock} />;
    case "goal":
      return <GoalWidget goal={item.goalId ? (data.goals.find((g) => g.id === item.goalId) ?? null) : (data.goals[0] ?? null)} />;
    case "focus":
      return <FocusWidget minutes={data.focusMinutes} />;
    case "free":
      return <FreeWidget free={data.free} clock={clock} />;
  }
}

/** The grid's columns and rows: 3 columns of 64 px, rows of 64 px, 8 px apart. */
export const GRID_STYLE = { gridTemplateColumns: `repeat(${GRID_COLUMNS}, ${CELL_PX}px)`, gridAutoRows: `${CELL_PX}px`, gap: `${GAP_PX}px` };

const sizeWords = (item: WidgetItem) => item.size.replace("x", " by ");

/** One cell of the grid. While editing: it wiggles, can be dragged or moved with the keys, has a minus and a size tag. */
export function WidgetCell({
  item,
  place,
  editing,
  dragging = false,
  onRemove,
  onCycleSize,
  onDragStart,
  onDragEnd,
  onDrop,
  onKeyDown,
  children,
}: {
  item: WidgetItem;
  place: Placement;
  editing: boolean;
  dragging?: boolean;
  onRemove?: () => void;
  onCycleSize?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDrop?: (event: DragEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  children: ReactNode;
}) {
  const { index, row, col, w, h } = place;
  return (
    <div
      style={{ gridRow: `${row + 1} / span ${h}`, gridColumn: `${col + 1} / span ${w}`, animationDelay: index % 2 ? "-0.15s" : undefined }}
      className={`relative min-w-0 ${editing ? "widget-wiggle cursor-grab rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30" : ""} ${dragging ? "opacity-40" : ""}`}
      draggable={editing}
      tabIndex={editing ? 0 : undefined}
      aria-label={editing ? `${WIDGET_NAMES[item.kind]}, ${sizeWords(item)}. Arrow keys move it, Delete removes it` : undefined}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => editing && event.preventDefault()}
      onDrop={onDrop}
      onKeyDown={(event) => editing && onKeyDown?.(event)}
    >
      <div className={`h-full ${editing ? "pointer-events-none select-none" : ""}`}>{children}</div>
      {editing && (
        <>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${WIDGET_NAMES[item.kind]}`}
            className="absolute -left-1.5 -top-1.5 z-10 grid size-5 place-items-center rounded-full bg-ink text-white shadow-float"
          >
            <Minus aria-hidden className="size-3" strokeWidth={2.6} />
          </button>
          {SIZES_OF[item.kind].length > 1 && (
            <button
              type="button"
              onClick={onCycleSize}
              aria-label={`Size ${sizeWords(item)}. Change size`}
              className="tabular absolute -bottom-1.5 -right-1.5 z-10 rounded-full bg-ink px-1.5 text-[10.5px] font-semibold leading-5 text-white shadow-float"
            >
              {item.size.replace("x", "×")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
