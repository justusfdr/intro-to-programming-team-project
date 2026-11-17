"use client";

// The widgets under the sidebar's navigation (spec 45): reads widgets_data on opening and every minute
// while the page is visible, the weather every 30 minutes (R47) and the trip to leave for (R27), and
// lays the widgets out in the 3 × 6 grid, as many rows as fit (layout.ts). Editing: the pencil or a
// right-click; remove, change size, drag (or arrow keys) to move, "Add" for the list; "Done" saves the
// list with save_widgets (R46). A refusal shows its message and puts the saved list back (R1).
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ChevronLeft, Minus, Pencil, Plus, RotateCcw } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { getJson, postJson } from "@/lib/client/post-json";
import { msToNextMinute } from "@/lib/time/next-minute";
import { fitsWith, pack, rowsFor, sizeOf } from "@/lib/widgets/layout";
import {
  CELL_PX,
  DEFAULT_LAYOUT,
  GAP_PX,
  GRID_COLUMNS,
  SIZES_OF,
  WIDGET_KINDS,
  WIDGET_NAMES,
  type WidgetItem,
  type WidgetKind,
  type WidgetsData,
} from "@/lib/widgets/types";
import type { WeatherAnswer } from "@/lib/widgets/weather";
import type { TravelAnswer } from "@/lib/travel/types";
import { FocusWidget, FreeWidget, GoalWidget, LeaveWidget, NextWidget, WeatherWidget, type Clock, type TripTravel } from "./tiles";

const MINUTE = 60_000;
const WEATHER_EVERY = 30 * MINUTE;
const TRIP_EVERY = 15 * MINUTE;

/** Runs `fn` now and every `ms` while the page is visible, and again when it becomes visible. */
function useVisibleInterval(fn: () => void, ms: number, enabled: boolean) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    if (!enabled) return;
    latest.current();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") latest.current();
    }, ms);
    const onShow = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [ms, enabled]);
}

/** The time, moved on at each new minute. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id = 0;
    const tick = () => {
      setNow(new Date());
      id = window.setTimeout(tick, msToNextMinute(Date.now()));
    };
    id = window.setTimeout(tick, msToNextMinute(Date.now()));
    return () => window.clearTimeout(id);
  }, []);
  return now;
}

/**
 * The weather (R47). The browser is asked for the location only when the user clicks "Use my location";
 * once allowed, it is used by itself from then on. Without it the server picks the event's place or home.
 */
function useWeather(enabled: boolean) {
  const [answer, setAnswer] = useState<WeatherAnswer | null>(null);
  const [canAsk, setCanAsk] = useState(false);
  const coords = useRef<{ lat: number; lon: number } | null>(null);
  const allowed = useRef(false);

  const load = useCallback(async () => {
    const result = await postJson("/api/weather", coords.current ?? {});
    const data = result.data as Partial<WeatherAnswer> | undefined;
    if (result.ok && data && typeof data.status === "string") setAnswer(data as WeatherAnswer);
    else if (result.status !== 401) setAnswer({ status: "unavailable", message: result.message || "Weather not available" });
  }, []);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) return void load();
    navigator.geolocation.getCurrentPosition(
      (position) => {
        allowed.current = true;
        coords.current = { lat: position.coords.latitude, lon: position.coords.longitude };
        setCanAsk(false);
        void load();
      },
      () => {
        // Refused or not found: the event's place or home, and no more asking.
        coords.current = null;
        setCanAsk(false);
        void load();
      },
      { enableHighAccuracy: false, maximumAge: WEATHER_EVERY, timeout: 10_000 },
    );
  }, [load]);

  const refresh = useCallback(() => {
    if (allowed.current) locate();
    else void load();
  }, [load, locate]);

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator) || !navigator.permissions) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled) return;
        if (status.state === "granted") {
          allowed.current = true;
          locate();
        } else {
          setCanAsk(status.state === "prompt");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, locate]);

  useVisibleInterval(refresh, WEATHER_EVERY, enabled);
  return { answer, onLocate: canAsk ? locate : undefined };
}

/** The trip to the event to leave for (R27), asked again every 15 minutes and when the event changes. */
function useTrip(tripId: string | null): TripTravel {
  const [trip, setTrip] = useState<{ id: string; answer: TravelAnswer | null } | null>(null);
  const load = useCallback(async () => {
    if (!tripId) return;
    const result = await postJson("/api/travel", { ids: [tripId] });
    const answer = (result.data as { travel?: Record<string, TravelAnswer> } | undefined)?.travel?.[tripId] ?? null;
    setTrip({ id: tripId, answer: result.ok ? answer : null });
  }, [tripId]);
  useVisibleInterval(load, TRIP_EVERY, tripId !== null);
  return trip && trip.id === tripId ? trip.answer : undefined;
}

const same = (a: WidgetItem[], b: WidgetItem[]) => JSON.stringify(a) === JSON.stringify(b);
const label = (item: WidgetItem) => `${WIDGET_NAMES[item.kind]}, ${item.size.replace("x", " by ")}`;

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

export function WidgetArea() {
  const [data, setData] = useState<WidgetsData | null>(null);
  const [off, setOff] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<WidgetItem[]>([]);
  const [resetAsked, setResetAsked] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const gridBox = useRef<HTMLDivElement>(null);
  const now = useMinuteClock();

  const loadData = useCallback(async () => {
    const result = await getJson("/api/widgets");
    if (result.ok) setData(result.data as WidgetsData);
    else if (result.status === 401) setOff(true);
  }, []);
  useVisibleInterval(loadData, MINUTE, !off);

  const ready = data !== null;
  const weather = useWeather(!off && ready);
  const travel = useTrip(data?.trip?.id ?? null);

  // As many rows as fit in the space between the navigation and the bottom links.
  useEffect(() => {
    const box = gridBox.current;
    if (!box) return;
    const measure = () => setRows(rowsFor(box.clientHeight, CELL_PX, GAP_PX));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [ready]);

  // A goal widget whose goal is gone is not shown, and is dropped at the next save (R46).
  const goalIds = useMemo(() => new Set(data?.goals.map((g) => g.id) ?? []), [data]);
  const shown = useCallback((list: WidgetItem[]) => list.filter((w) => w.kind !== "goal" || !w.goalId || goalIds.has(w.goalId)), [goalIds]);
  const saved = useMemo(() => (data ? shown(data.layout) : []), [data, shown]);
  const layout = editing ? draft : saved;
  const { placed, hidden } = useMemo(() => pack(layout, rows), [layout, rows]);

  const startEditing = useCallback(() => {
    setDraft(saved);
    setResetAsked(false);
    setMessage("");
    setAdding(false);
    setEditing(true);
  }, [saved]);

  const finish = useCallback(async () => {
    setAdding(false);
    if (!data) return setEditing(false);
    const reset = resetAsked && same(draft, DEFAULT_LAYOUT);
    if (!reset && same(draft, saved)) return setEditing(false);
    setSaving(true);
    const result = await postJson("/api/widgets", reset ? { reset: true } : { layout: draft });
    setSaving(false);
    if (result.ok) {
      const answer = result.data as { layout?: WidgetItem[]; isDefault?: boolean } | undefined;
      setData({ ...data, layout: answer?.layout ?? draft, isDefault: answer?.isDefault ?? reset });
      setMessage("");
      setEditing(false);
    } else {
      // Nothing was saved (R1): back to the saved list.
      setMessage(result.message);
      setDraft(saved);
    }
  }, [data, draft, resetAsked, saved]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") void finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, finish]);

  if (off || !data) return <div className="min-h-0 flex-1" aria-hidden />;

  const clock: Clock = { now, timeZone: data.timeZone, timeFormat: data.timeFormat };
  const firstGoal = data.goals[0] ?? null;

  const render = (item: WidgetItem) => {
    switch (item.kind) {
      case "weather":
        return <WeatherWidget size={item.size} answer={weather.answer} clock={clock} onLocate={editing ? undefined : weather.onLocate} />;
      case "next":
        return (
          <NextWidget
            size={item.size}
            next={data.next}
            after={data.after}
            tomorrow={data.tomorrow}
            travel={data.next && data.trip && data.next.id === data.trip.id ? travel : null}
            clock={clock}
          />
        );
      case "leave":
        return <LeaveWidget size={item.size} trip={data.trip} travel={travel} clock={clock} />;
      case "goal":
        return <GoalWidget goal={item.goalId ? (data.goals.find((g) => g.id === item.goalId) ?? null) : firstGoal} />;
      case "focus":
        return <FocusWidget minutes={data.focusMinutes} />;
      case "free":
        return <FreeWidget free={data.free} clock={clock} />;
    }
  };

  const remove = (index: number) => setDraft((list) => list.filter((_, i) => i !== index));
  const cycleSize = (index: number) =>
    setDraft((list) => {
      const item = list[index];
      const sizes = SIZES_OF[item.kind];
      const nextSize = sizes[(sizes.indexOf(item.size) + 1) % sizes.length];
      const changed = list.map((w, i) => (i === index ? { ...w, size: nextSize } : w));
      return pack(changed).hidden.length === 0 ? changed : list;
    });
  const onDrop = (event: DragEvent, to: number) => {
    event.preventDefault();
    if (dragFrom !== null && dragFrom !== to) setDraft((list) => move(list, dragFrom, to));
    setDragFrom(null);
  };
  const onTileKey = (event: KeyboardEvent, index: number) => {
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") setDraft((list) => move(list, index, index - 1));
    else if (event.key === "ArrowDown" || event.key === "ArrowRight") setDraft((list) => move(list, index, index + 1));
    else if (event.key === "Delete" || event.key === "Backspace") remove(index);
    else return;
    event.preventDefault();
  };

  return (
    <section aria-label="Widgets" className="mt-5 mb-3 flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1.5 pl-[9px] text-xs font-medium text-ink-3">
        <span className="mr-auto">Widgets</span>
        {editing ? (
          <>
            {!adding && (
              <button type="button" onClick={() => setAdding(true)} className={buttonClass("secondary", "sm", "h-7 gap-1 px-2.5")}>
                <Plus aria-hidden className="size-3.5" strokeWidth={2} />
                Add
              </button>
            )}
            <button type="button" onClick={() => void finish()} disabled={saving} className={buttonClass("primary", "sm", "h-7 px-3")}>
              Done
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            aria-label="Edit widgets"
            title="Edit widgets"
            className="grid size-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            <Pencil aria-hidden className="size-3.5" strokeWidth={1.8} />
          </button>
        )}
      </div>
      {message && (
        <p role="alert" className="mt-1 pl-[9px] text-xs text-danger">
          {message}
        </p>
      )}
      <div ref={gridBox} className="relative mt-2 min-h-0 flex-1">
        {adding ? (
          <Gallery
            draft={draft}
            goals={data.goals}
            onAdd={(item) => {
              setDraft((list) => [...list, item]);
              setAdding(false);
            }}
            onReset={() => {
              setDraft(DEFAULT_LAYOUT);
              setResetAsked(true);
              setAdding(false);
            }}
            onBack={() => setAdding(false)}
          />
        ) : (
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, ${CELL_PX}px)`, gridAutoRows: `${CELL_PX}px`, gap: `${GAP_PX}px` }}
            onContextMenu={(event) => {
              if (editing) return;
              event.preventDefault();
              startEditing();
            }}
          >
            {placed.map(({ index, row, col, w, h }) => {
              const item = layout[index];
              const sizes = SIZES_OF[item.kind];
              return (
                <div
                  key={`${index}-${item.kind}-${item.goalId ?? ""}`}
                  style={{ gridRow: `${row + 1} / span ${h}`, gridColumn: `${col + 1} / span ${w}`, animationDelay: index % 2 ? "-0.15s" : undefined }}
                  className={`relative min-w-0 ${editing ? "widget-wiggle cursor-grab rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30" : ""} ${dragFrom === index ? "opacity-40" : ""}`}
                  draggable={editing}
                  tabIndex={editing ? 0 : undefined}
                  aria-label={editing ? `${label(item)}. Arrow keys move it, Delete removes it` : undefined}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    setDragFrom(index);
                  }}
                  onDragEnd={() => setDragFrom(null)}
                  onDragOver={(event) => editing && event.preventDefault()}
                  onDrop={(event) => onDrop(event, index)}
                  onKeyDown={(event) => editing && onTileKey(event, index)}
                >
                  <div className={`h-full ${editing ? "pointer-events-none select-none" : ""}`}>{render(item)}</div>
                  {editing && (
                    <>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        aria-label={`Remove ${WIDGET_NAMES[item.kind]}`}
                        className="absolute -left-1.5 -top-1.5 z-10 grid size-5 place-items-center rounded-full bg-ink text-white shadow-float"
                      >
                        <Minus aria-hidden className="size-3" strokeWidth={2.6} />
                      </button>
                      {sizes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => cycleSize(index)}
                          aria-label={`Size ${item.size.replace("x", " by ")}. Change size`}
                          className="tabular absolute bottom-1.5 right-1.5 z-10 rounded-full bg-ink px-1.5 text-[10.5px] font-semibold leading-[18px] text-white"
                        >
                          {item.size.replace("x", "×")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {editing && !adding && hidden.length > 0 && (
          <p className="absolute inset-x-0 bottom-0 bg-canvas pl-[9px] pt-1 text-[11px] text-ink-3">
            {hidden.length === 1 ? "1 widget does not fit on this screen" : `${hidden.length} widgets do not fit on this screen`}
          </p>
        )}
      </div>
    </section>
  );
}

/** The list of widgets to add, each in its sizes; a size with no room left is greyed out. */
function Gallery({
  draft,
  goals,
  onAdd,
  onReset,
  onBack,
}: {
  draft: WidgetItem[];
  goals: WidgetsData["goals"];
  onAdd: (item: WidgetItem) => void;
  onReset: () => void;
  onBack: () => void;
}) {
  const entries: { kind: WidgetKind; name: string; goalId?: string | null }[] = WIDGET_KINDS.flatMap((kind) =>
    kind === "goal"
      ? goals.length > 0
        ? goals.map((g) => ({ kind, name: g.title, goalId: g.id }))
        : [{ kind, name: "Goal", goalId: null }]
      : [{ kind, name: WIDGET_NAMES[kind] }],
  );
  return (
    <div className="scroll-thin absolute inset-0 flex flex-col overflow-y-auto rounded-card border border-line-subtle bg-surface p-2">
      <button type="button" onClick={onBack} className="mb-1 flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-ink hover:bg-raised">
        <ChevronLeft aria-hidden className="size-3.5" strokeWidth={2} />
        Add a widget
      </button>
      <ul className="flex flex-col">
        {entries.map((entry) => (
          <li key={`${entry.kind}-${entry.goalId ?? ""}`} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-ink">{entry.name}</span>
            {SIZES_OF[entry.kind].map((size) => {
              const item: WidgetItem = entry.kind === "goal" ? { kind: entry.kind, size, goalId: entry.goalId ?? null } : { kind: entry.kind, size };
              const room = fitsWith(draft, item);
              const { w, h } = sizeOf(size);
              return (
                <button
                  key={size}
                  type="button"
                  disabled={!room}
                  onClick={() => onAdd(item)}
                  title={room ? `Add ${entry.name}, ${w} by ${h}` : "No room. Remove a widget first"}
                  aria-label={`Add ${entry.name}, ${w} by ${h}`}
                  className={buttonClass("secondary", "sm", "tabular h-6 px-2 text-[11px]")}
                >
                  {size.replace("x", "×")}
                </button>
              );
            })}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onReset} className={buttonClass("ghost", "sm", "mt-auto h-7 gap-1 self-start px-2 text-[11px]")}>
        <RotateCcw aria-hidden className="size-3" strokeWidth={2} />
        Reset to standard
      </button>
    </div>
  );
}
