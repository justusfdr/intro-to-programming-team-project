// The grid of widgets without any state (spec 45): which tile a widget is, and the cell it sits in, with
// the minus and the size tag while editing. WidgetArea holds the state and passes everything in; the
// preview tool renders the same pieces with sample data.
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import Link from "next/link";
import { localDateOf } from "@/lib/time/zoned";
import { Minus } from "lucide-react";
import type { Placement } from "@/lib/widgets/layout";
import { CELL_PX, GAP_PX, GRID_COLUMNS, SIZES_OF, WIDGET_NAMES, type WidgetItem, type WidgetsData } from "@/lib/widgets/types";
import type { WeatherAnswer } from "@/lib/widgets/weather";
import { FocusWidget, FreeWidget, GoalWidget, LeaveWidget, NextWidget, routeLink, WeatherWidget, type Clock, type TripTravel } from "./tiles";

/** What the tiles are drawn from. */
export type WidgetContext = {
  data: WidgetsData;
  /** The weather for a widget: its own city, or (none) where the user is (R47). */
  weatherFor: (city: string | null | undefined) => WeatherAnswer | null;
  /** Offered while the browser has not been asked for the location (R47). */
  onLocate?: () => void;
  /** A click on a weather widget: the weather in detail. */
  onOpenWeather?: (item: WidgetItem) => void;
  travel: TripTravel;
  clock: Clock;
};

const LINK = "block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30";

/**
 * The tile of one widget and what a click on it does: weather opens the detail, next up opens the event
 * in the calendar, time to leave opens the way in Google Maps, a goal its card, focus the Focus page.
 * While editing nothing inside reacts: a click opens the widget's settings instead (WidgetArea).
 */
export function renderWidget(item: WidgetItem, ctx: WidgetContext, editing: boolean): ReactNode {
  const { data, clock } = ctx;
  switch (item.kind) {
    case "weather": {
      const answer = ctx.weatherFor(item.city);
      const tile = <WeatherWidget size={item.size} answer={answer} clock={clock} onLocate={editing || item.city ? undefined : ctx.onLocate} />;
      if (editing || !ctx.onOpenWeather || answer?.status !== "ok") return tile;
      const open = () => ctx.onOpenWeather?.(item);
      return (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Weather in ${answer.weather.place}, open the details`}
          onClick={open}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            open();
          }}
          className={`${LINK} cursor-pointer`}
        >
          {tile}
        </div>
      );
    }
    case "next": {
      const tile = (
        <NextWidget
          size={item.size}
          next={data.next}
          after={data.after}
          tomorrow={data.tomorrow}
          travel={data.next && data.trip && data.next.id === data.trip.id ? ctx.travel : null}
          clock={clock}
        />
      );
      if (editing || !data.next) return tile;
      const day = localDateOf(new Date(data.next.start), clock.timeZone);
      return (
        <Link href={`/?view=day&date=${day}&event=${data.next.id}`} aria-label={`Open ${data.next.title} in the calendar`} className={LINK}>
          {tile}
        </Link>
      );
    }
    case "leave": {
      const tile = <LeaveWidget size={item.size} trip={data.trip} travel={ctx.travel} clock={clock} />;
      const trip = data.trip;
      const travel = ctx.travel;
      if (editing || !trip?.location || !travel) return tile;
      return (
        <a href={routeLink(trip.location, travel.mode)} target="_blank" rel="noreferrer" aria-label={`The way to ${trip.title} in Google Maps`} className={LINK}>
          {tile}
        </a>
      );
    }
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
  onOpen,
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
  /** While editing: a click on the widget opens its settings. */
  onOpen?: () => void;
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
      aria-label={editing ? `${WIDGET_NAMES[item.kind]}, ${sizeWords(item)}. Enter opens its settings, arrow keys move it, Delete removes it` : undefined}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => editing && event.preventDefault()}
      onDrop={onDrop}
      onKeyDown={(event) => {
        if (!editing) return;
        if (event.key === "Enter" && event.target === event.currentTarget) {
          event.preventDefault();
          onOpen?.();
        } else onKeyDown?.(event);
      }}
      onClick={() => editing && onOpen?.()}
    >
      <div className={`h-full ${editing ? "pointer-events-none select-none" : ""}`}>{children}</div>
      {editing && (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove?.();
            }}
            aria-label={`Remove ${WIDGET_NAMES[item.kind]}`}
            className="absolute -left-1.5 -top-1.5 z-10 grid size-5 place-items-center rounded-full bg-ink text-white shadow-float"
          >
            <Minus aria-hidden className="size-3" strokeWidth={2.6} />
          </button>
          {SIZES_OF[item.kind].length > 1 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCycleSize?.();
              }}
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
