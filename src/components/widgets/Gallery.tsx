"use client";

// The widget gallery (spec 47), like the one on a phone: the widgets in categories on the left, and on
// the right each widget of the category as a live preview in every size it comes in. A preview is
// dragged out into the sidebar: the gallery steps aside as soon as it moves and WidgetArea places it
// where it is let go. A click (or Enter) adds it without dragging. The heading says how many fields are
// still free on this screen; a size with no room left says so and cannot be picked up.
import { useId, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CalendarDays, Cloud, RotateCcw, Target, Timer, type LucideIcon } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { fitsWith, pack, sizeOf } from "@/lib/widgets/layout";
import { CELL_PX, GAP_PX, type WidgetItem, type WidgetKind, type WidgetSize } from "@/lib/widgets/types";
import { WidgetDialog } from "./Dialog";
import { renderWidget, type WidgetContext } from "./grid";

type Entry = { key: string; kind: WidgetKind; name: string; text: string; sizes: readonly WidgetSize[]; goalId?: string | null };
type Category = { id: string; name: string; icon: LucideIcon; entries: Entry[] };

/** A preview picked up to be dragged into the sidebar: the pointer, and where on the widget it holds it. */
export type PickUp = { item: WidgetItem; x: number; y: number; dx: number; dy: number };

/** How far the pointer moves before a press on a preview becomes a drag, in px. */
export const DRAG_FROM = 5;

const SIZE_NAMES: Record<WidgetSize, string> = { "1x1": "Small", "3x1": "Wide", "3x2": "Medium", "3x4": "Large" };

/** The px size of a widget of this size. */
export function pxOf(size: WidgetSize): { width: number; height: number } {
  const { w, h } = sizeOf(size);
  return { width: w * CELL_PX + (w - 1) * GAP_PX, height: h * CELL_PX + (h - 1) * GAP_PX };
}

/** Free fields on this screen: the grid's rows that fit, minus what the shown widgets take. */
export function freeFields(layout: WidgetItem[], rows: number): number {
  const used = pack(layout, rows).placed.reduce((sum, p) => sum + p.w * p.h, 0);
  return Math.max(0, rows * 3 - used);
}

/** One more widget fits on this screen (and in the full 3 × 6 grid, R47). */
export function fitsOnScreen(layout: WidgetItem[], item: WidgetItem, rows: number): boolean {
  return fitsWith(layout, item) && !pack([...layout, item], rows).hidden.includes(layout.length);
}

function categories(goals: WidgetContext["data"]["goals"]): Category[] {
  return [
    {
      id: "weather",
      name: "Weather",
      icon: Cloud,
      entries: [{ key: "weather", kind: "weather", name: "Weather", text: "Where you are, or a city you choose. A click shows the next 24 hours and 7 days.", sizes: ["3x2", "1x1"] }],
    },
    {
      id: "calendar",
      name: "Calendar",
      icon: CalendarDays,
      entries: [
        { key: "next", kind: "next", name: "Next up", text: "Your next event, its place and when to leave. A click opens it in the calendar.", sizes: ["3x2", "3x4"] },
        { key: "leave", kind: "leave", name: "Time to leave", text: "Counts down to when you need to set off: green, then yellow, orange, and red from 10 minutes.", sizes: ["1x1", "3x1"] },
        { key: "free", kind: "free", name: "Free time", text: "The next free stretch today, with one click into focus.", sizes: ["3x1"] },
      ],
    },
    {
      id: "goals",
      name: "Goals",
      icon: Target,
      entries:
        goals.length > 0
          ? goals.map((g) => ({ key: `goal-${g.id}`, kind: "goal" as const, name: g.title, text: "This week's progress in the goal's colour. A click opens the goal.", sizes: ["1x1"] as const, goalId: g.id }))
          : [{ key: "goal", kind: "goal", name: "Goal", text: "Add a goal first; then its week shows here.", sizes: ["1x1"], goalId: null }],
    },
    {
      id: "focus",
      name: "Focus",
      icon: Timer,
      entries: [{ key: "focus", kind: "focus", name: "Focus today", text: "The minutes you focused today. A click opens Focus.", sizes: ["1x1"] }],
    },
  ];
}

export function Gallery({
  open,
  onClose,
  draft,
  rows,
  ctx,
  onAdd,
  onPickUp,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  draft: WidgetItem[];
  /** Rows that fit on this screen. */
  rows: number;
  ctx: WidgetContext;
  onAdd: (item: WidgetItem) => void;
  /** A preview was dragged out of the gallery. */
  onPickUp: (pickUp: PickUp) => void;
  onReset: () => void;
}) {
  const titleId = useId();
  const all = categories(ctx.data.goals);
  const [shown, setShown] = useState(all[0].id);
  const category = all.find((c) => c.id === shown) ?? all[0];
  const free = freeFields(draft, rows);

  // A press becomes a drag once the pointer has moved a few px; until then a release is a click.
  const press = (item: WidgetItem) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault(); // no text selection while dragging; the click still comes
    const widget = (event.currentTarget.firstElementChild as HTMLElement).getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    const move = (moved: PointerEvent) => {
      if (Math.hypot(moved.clientX - startX, moved.clientY - startY) < DRAG_FROM) return;
      stop();
      onPickUp({
        item,
        x: moved.clientX,
        y: moved.clientY,
        dx: Math.min(Math.max(startX - widget.left, 0), widget.width),
        dy: Math.min(Math.max(startY - widget.top, 0), widget.height),
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  return (
    <WidgetDialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      width="md:max-w-3xl"
      title={
        <span className="flex items-baseline gap-2">
          Add a widget
          <span className={`text-xs font-medium ${free === 0 ? "text-warning" : "text-ink-3"}`}>
            {free === 0 ? "No room left on this screen" : `${free === 1 ? "1 free field" : `${free} free fields`} · drag a widget into the sidebar`}
          </span>
        </span>
      }
      footer={
        <>
          <button type="button" onClick={onReset} className={buttonClass("ghost", "sm", "mr-auto gap-1.5")}>
            <RotateCcw aria-hidden className="size-3.5" strokeWidth={2} />
            Reset to standard
          </button>
          <button type="button" onClick={onClose} className={buttonClass("primary", "sm")}>
            Done
          </button>
        </>
      }
    >
      {/* The body always has the height the Weather page needs (26rem), whatever category is shown, so the
          window never grows, shrinks or jumps. A page with more previews scrolls inside the right panel.
          On a short screen it takes the room that is left, still the same for every category. */}
      <div className="grid h-[min(26rem,calc(100dvh-11rem))] grid-cols-[10.5rem_1fr]">
        <nav aria-label="Widget categories" className="scroll-thin flex flex-col gap-0.5 overflow-y-auto border-r border-line-subtle px-3 py-2">
          {all.map((c) => {
            const Icon = c.icon;
            const on = c.id === category.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-current={on ? "true" : undefined}
                onClick={() => setShown(c.id)}
                className={`flex h-9 items-center gap-2.5 rounded-lg px-[9px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                  on ? "bg-raised font-medium text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink"
                }`}
              >
                <Icon aria-hidden className={`size-[18px] shrink-0 ${on ? "text-ink" : "text-ink-3"}`} strokeWidth={on ? 2.2 : 1.8} />
                {c.name}
              </button>
            );
          })}
        </nav>
        <div className="scroll-thin flex min-h-0 flex-col gap-6 overflow-y-auto px-5 py-3">
          {category.entries.map((entry) => (
            <section key={entry.key} aria-label={entry.name} className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold tracking-snug">{entry.name}</h3>
                <p className="text-xs text-ink-2">{entry.text}</p>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                {entry.sizes.map((size) => {
                  const item: WidgetItem = entry.kind === "goal" ? { kind: "goal", size, goalId: entry.goalId ?? null } : { kind: entry.kind, size };
                  const room = fitsOnScreen(draft, item, rows);
                  const { width, height } = pxOf(size);
                  const { w, h } = sizeOf(size);
                  return (
                    <div key={size} className="flex flex-col items-start gap-2">
                      <button
                        type="button"
                        disabled={!room}
                        onPointerDown={press(item)}
                        onClick={() => onAdd(item)}
                        aria-label={`Add ${entry.name}, ${SIZE_NAMES[size].toLowerCase()}`}
                        title={room ? "Drag into the sidebar, or click to add" : "No room for this size on this screen"}
                        className="grid touch-none cursor-grab place-items-center rounded-card bg-raised p-4 transition-shadow hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
                      >
                        <div aria-hidden className="pointer-events-none select-none" style={{ width, height }}>
                          {renderWidget(item, ctx, true)}
                        </div>
                      </button>
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="tabular text-xs text-ink-2">
                          {SIZE_NAMES[size]} · {w}×{h}
                        </span>
                        {!room && <span className="text-[11px] font-medium text-ink-3">No room</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </WidgetDialog>
  );
}
