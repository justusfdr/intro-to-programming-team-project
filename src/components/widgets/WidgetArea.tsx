"use client";

// The widgets under the sidebar's navigation (spec 45): reads widgets_data on opening and every minute
// while the page is visible, the weather every 30 minutes (R47) and the trip to leave for (R27), and
// lays the widgets out in the 3 × 6 grid, as many rows as fit (layout.ts). A click on a widget does what
// grid.tsx says (the weather opens in detail). Editing: the pencil or a right-click; the free fields of
// this screen show as "+"; a click on a widget opens its settings; remove, change size, drag (or arrow
// keys) to move; "Add" opens the gallery; "Done" saves the list with save_widgets (R46). A refusal shows
// its message and puts the saved list back (R1).
import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { getJson, postJson } from "@/lib/client/post-json";
import { msToNextMinute } from "@/lib/time/next-minute";
import { pack, rowsFor } from "@/lib/widgets/layout";
import { CELL_PX, DEFAULT_LAYOUT, GAP_PX, GRID_COLUMNS, SIZES_OF, WIDGET_NAMES, type WidgetItem, type WidgetsData } from "@/lib/widgets/types";
import type { WeatherAnswer } from "@/lib/widgets/weather";
import type { TravelAnswer } from "@/lib/travel/types";
import { WidgetDialog } from "./Dialog";
import { freeFields, Gallery } from "./Gallery";
import { GRID_STYLE, renderWidget, WidgetCell, type WidgetContext } from "./grid";
import type { TripTravel } from "./tiles";
import { WeatherDetail } from "./WeatherDetail";
import { WidgetSettings } from "./WidgetSettings";

const MINUTE = 60_000;
const WEATHER_EVERY = 30 * MINUTE;
const TRIP_EVERY = 15 * MINUTE;

/**
 * Runs `fn` now and every `ms` while the page is visible, and again when it becomes visible. A new `key`
 * (for example another event) starts over at once.
 */
function useVisibleInterval(fn: () => void, ms: number, enabled: boolean, key: string = "") {
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
  }, [ms, enabled, key]);
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
  useVisibleInterval(load, TRIP_EVERY, tripId !== null, tripId ?? "");
  return trip && trip.id === tripId ? trip.answer : undefined;
}

/** The weather of the cities that widgets name, each asked every 30 minutes (R47). */
function useCityWeather(cities: string[], enabled: boolean): Record<string, WeatherAnswer> {
  const [answers, setAnswers] = useState<Record<string, WeatherAnswer>>({});
  const key = [...new Set(cities)].sort().join("\n");
  const load = useCallback(async () => {
    const list = key === "" ? [] : key.split("\n");
    const pairs = await Promise.all(
      list.map(async (city): Promise<[string, WeatherAnswer] | null> => {
        const result = await postJson("/api/weather", { city });
        const data = result.data as Partial<WeatherAnswer> | undefined;
        if (result.ok && data && typeof data.status === "string") return [city, data as WeatherAnswer];
        return result.status === 401 ? null : [city, { status: "unavailable", message: result.message || "Weather not available" }];
      }),
    );
    setAnswers((old) => ({ ...old, ...Object.fromEntries(pairs.filter((p) => p !== null)) }));
  }, [key]);
  useVisibleInterval(load, WEATHER_EVERY, enabled && key !== "", key);
  return answers;
}

const same = (a: WidgetItem[], b: WidgetItem[]) => JSON.stringify(a) === JSON.stringify(b);

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

/** The fields of the first `rows` rows that no widget takes, top to bottom. */
function freeCells(layout: WidgetItem[], rows: number): { row: number; col: number }[] {
  const taken = new Set<string>();
  for (const p of pack(layout, rows).placed) for (let r = p.row; r < p.row + p.h; r++) for (let c = p.col; c < p.col + p.w; c++) taken.add(`${r},${c}`);
  const cells: { row: number; col: number }[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < GRID_COLUMNS; col++) if (!taken.has(`${row},${col}`)) cells.push({ row, col });
  return cells;
}

export function WidgetArea() {
  const [data, setData] = useState<WidgetsData | null>(null);
  const [off, setOff] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [settingsOf, setSettingsOf] = useState<number | null>(null);
  const [detail, setDetail] = useState<WidgetItem | null>(null);
  const [draft, setDraft] = useState<WidgetItem[]>([]);
  const [resetAsked, setResetAsked] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const gridBox = useRef<HTMLDivElement>(null);
  const detailTitle = useId();
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
  const cities = useMemo(() => layout.flatMap((w) => (w.kind === "weather" && w.city ? [w.city] : [])), [layout]);
  const cityWeather = useCityWeather(cities, !off && ready);

  const startEditing = useCallback(() => {
    setDraft(saved);
    setResetAsked(false);
    setMessage("");
    setAdding(false);
    setEditing(true);
  }, [saved]);

  const finish = useCallback(async () => {
    setAdding(false);
    setSettingsOf(null);
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
    // Escape inside a dialog closes the dialog only.
    if (!editing || adding || settingsOf !== null) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") void finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, adding, settingsOf, finish]);

  if (off || !data) return <div className="min-h-0 flex-1" aria-hidden />;

  const ctx: WidgetContext = {
    data,
    weatherFor: (city) => (city ? (cityWeather[city] ?? null) : weather.answer),
    onLocate: weather.onLocate,
    onOpenWeather: setDetail,
    travel,
    clock: { now, timeZone: data.timeZone, timeFormat: data.timeFormat },
  };
  const detailAnswer = detail ? ctx.weatherFor(detail.city) : null;
  const free = freeCells(layout, rows);

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
  const freeNow = freeFields(layout, rows);

  return (
    <section aria-label="Widgets" className="mt-5 mb-3 flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1.5 pl-[9px] text-xs font-medium text-ink-3">
        {/* While editing, the label says how much room this screen has left, or what does not fit. */}
        {!editing ? (
          <span className="mr-auto">Widgets</span>
        ) : hidden.length > 0 ? (
          <button
            type="button"
            onClick={() => setDraft((list) => list.filter((_, i) => !hidden.includes(i)))}
            title={`${hidden.map((i) => WIDGET_NAMES[layout[i].kind]).join(", ")} ${hidden.length === 1 ? "does" : "do"} not fit on this screen. Click to remove ${hidden.length === 1 ? "it" : "them"}, or make the window taller.`}
            className="mr-auto inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
          >
            {hidden.length} hidden
            <X aria-hidden className="size-3" strokeWidth={2.4} />
          </button>
        ) : (
          <span className="mr-auto whitespace-nowrap">{freeNow === 0 ? "Full" : `${freeNow} free`}</span>
        )}
        {editing ? (
          <>
            <button type="button" onClick={() => setAdding(true)} className={buttonClass("secondary", "sm", "h-7 gap-1 px-2.5")}>
              <Plus aria-hidden className="size-3.5" strokeWidth={2} />
              Add
            </button>
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
        <div
          className="grid"
          style={GRID_STYLE}
          onContextMenu={(event) => {
            if (editing) return;
            event.preventDefault();
            startEditing();
          }}
        >
          {placed.map((place) => {
            const { index } = place;
            const item = layout[index];
            return (
              <WidgetCell
                key={`${index}-${item.kind}-${item.goalId ?? ""}-${item.city ?? ""}`}
                item={item}
                place={place}
                editing={editing}
                dragging={dragFrom === index}
                onRemove={() => remove(index)}
                onCycleSize={() => cycleSize(index)}
                onOpen={() => setSettingsOf(index)}
                onDragStart={() => setDragFrom(index)}
                onDragEnd={() => setDragFrom(null)}
                onDrop={(event) => onDrop(event, index)}
                onKeyDown={(event) => onTileKey(event, index)}
              >
                {renderWidget(item, ctx, editing)}
              </WidgetCell>
            );
          })}
          {/* While editing, every field still free on this screen is a "+" that opens the gallery. */}
          {editing &&
            free.map(({ row, col }) => (
              <button
                key={`free-${row}-${col}`}
                type="button"
                onClick={() => setAdding(true)}
                aria-label="Add a widget"
                style={{ gridRow: row + 1, gridColumn: col + 1 }}
                className="grid place-items-center rounded-card border-[1.5px] border-dashed border-line text-ink-3 transition-colors hover:border-ink-3 hover:bg-raised hover:text-ink"
              >
                <Plus aria-hidden className="size-4" strokeWidth={1.8} />
              </button>
            ))}
        </div>
      </div>

      <Gallery
        open={adding}
        onClose={() => setAdding(false)}
        draft={draft}
        rows={rows}
        ctx={ctx}
        onAdd={(item) => {
          setDraft((list) => [...list, item]);
          setAdding(false);
        }}
        onReset={() => {
          setDraft(DEFAULT_LAYOUT);
          setResetAsked(true);
          setAdding(false);
        }}
      />
      <WidgetSettings
        draft={draft}
        index={editing ? settingsOf : null}
        rows={rows}
        ctx={ctx}
        onChange={(item) => setDraft((list) => list.map((w, i) => (i === settingsOf ? item : w)))}
        onRemove={() => {
          if (settingsOf !== null) remove(settingsOf);
          setSettingsOf(null);
        }}
        onClose={() => setSettingsOf(null)}
      />
      <WidgetDialog open={detailAnswer?.status === "ok"} onClose={() => setDetail(null)} titleId={detailTitle} title="Weather" width="md:max-w-xl">
        {detailAnswer?.status === "ok" && <WeatherDetail weather={detailAnswer.weather} clock={ctx.clock} />}
      </WidgetDialog>
    </section>
  );
}
