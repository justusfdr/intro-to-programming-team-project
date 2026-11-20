"use client";

// The widgets under the sidebar's navigation (spec 47): reads widgets_data on opening and every minute
// while the page is visible, the weather every 30 minutes (R48) and the trip to leave for (R27), and
// lays the widgets out in the 3 × 6 grid, as many rows as fit (layout.ts). A click on a widget does what
// grid.tsx says (the weather opens in detail). Editing: the pencil or a right-click; the free fields of
// this screen show as "+"; a click on a widget opens its settings; remove, change size, drag (or arrow
// keys) to move: the widget follows the pointer and the grid shows it in the field it would land in; "Add" opens the gallery, whose widgets are dragged into the grid (or clicked, which puts
// them in the "+" field that opened the gallery, else at the end); "Done" saves the list with save_widgets (R47). A refusal shows
// its message and puts the saved list back (R1).
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { getJson, postJson } from "@/lib/client/post-json";
import { SETTINGS_SAVED } from "@/lib/client/settings-saved";
import { msToNextMinute } from "@/lib/time/next-minute";
import { nudge, pack, pinned, placeAt, rowsFor } from "@/lib/widgets/layout";
import { CELL_PX, DEFAULT_LAYOUT, GAP_PX, GRID_COLUMNS, WIDGET_NAMES, type WidgetItem, type WidgetsData } from "@/lib/widgets/types";
import type { WeatherAnswer } from "@/lib/widgets/weather";
import type { TravelAnswer } from "@/lib/travel/types";
import { remember, remembered } from "./cache";
import { WidgetDialog } from "./Dialog";
import { DRAG_FROM, freeFields, Gallery, pxOf, type PickUp } from "./Gallery";
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
 * The weather (R48). The browser is asked for the location only when the user clicks "Use my location";
 * once allowed, it is used by itself from then on. Without it the server picks the event's place or home.
 */
function useWeather(enabled: boolean) {
  const [answer, setAnswerState] = useState<WeatherAnswer | null>(() => remembered().weather);
  const setAnswer = useCallback((value: WeatherAnswer) => {
    remember({ weather: value });
    setAnswerState(value);
  }, []);
  const [canAsk, setCanAsk] = useState(false);
  const coords = useRef<{ lat: number; lon: number } | null>(null);
  const allowed = useRef(false);

  const load = useCallback(async () => {
    const result = await postJson("/api/weather", coords.current ?? {});
    const data = result.data as Partial<WeatherAnswer> | undefined;
    if (result.ok && data && typeof data.status === "string") setAnswer(data as WeatherAnswer);
    else if (result.status !== 401) setAnswer({ status: "unavailable", message: result.message || "Weather not available" });
  }, [setAnswer]);

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
  const [trip, setTrip] = useState<{ id: string; answer: TravelAnswer | null } | null>(() => {
    const trips = remembered().trips;
    return tripId && tripId in trips ? { id: tripId, answer: trips[tripId] } : null;
  });
  const load = useCallback(async () => {
    if (!tripId) return;
    const result = await postJson("/api/travel", { ids: [tripId] });
    const answer = (result.data as { travel?: Record<string, TravelAnswer> } | undefined)?.travel?.[tripId] ?? null;
    const value = result.ok ? answer : null;
    remember({ trips: { ...remembered().trips, [tripId]: value } });
    setTrip({ id: tripId, answer: value });
  }, [tripId]);
  useVisibleInterval(load, TRIP_EVERY, tripId !== null, tripId ?? "");
  if (trip && trip.id === tripId) return trip.answer;
  // Another event than the one asked about: what was known about it before, if anything.
  const known = tripId ? remembered().trips : {};
  return tripId && tripId in known ? known[tripId] : undefined;
}

/** The weather of the cities that widgets name, each asked every 30 minutes (R48). */
function useCityWeather(cities: string[], enabled: boolean): Record<string, WeatherAnswer> {
  const [answers, setAnswers] = useState<Record<string, WeatherAnswer>>(() => remembered().cities);
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
    const known = { ...remembered().cities, ...Object.fromEntries(pairs.filter((p) => p !== null)) };
    remember({ cities: known });
    setAnswers(known);
  }, [key]);
  useVisibleInterval(load, WEATHER_EVERY, enabled && key !== "", key);
  return answers;
}

const same = (a: WidgetItem[], b: WidgetItem[]) => JSON.stringify(a) === JSON.stringify(b);

/** The fields of the first `rows` rows that no widget takes, top to bottom. */
function freeCells(layout: WidgetItem[], rows: number): { row: number; col: number }[] {
  const taken = new Set<string>();
  for (const p of pack(layout, rows).placed) for (let r = p.row; r < p.row + p.h; r++) for (let c = p.col; c < p.col + p.w; c++) taken.add(`${r},${c}`);
  const cells: { row: number; col: number }[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < GRID_COLUMNS; col++) if (!taken.has(`${row},${col}`)) cells.push({ row, col });
  return cells;
}

/**
 * A widget being dragged: one picked up in the gallery, or one of the grid's own (`origin`: the list as it
 * was, `from`: where the widget is in it), taken out of the list while it moves and put back as it was
 * when it is let go where it cannot land.
 */
type Carry = PickUp & { origin?: WidgetItem[]; from?: number };
/** Where a dragged widget would land: the list with it put there, and where it is in that list. */
type Landing = { layout: WidgetItem[]; index: number };

export function WidgetArea() {
  // What was shown last on the page before (cache.ts), so a page change does not start empty.
  const [data, setDataState] = useState<WidgetsData | null>(() => remembered().data);
  const setData = useCallback((value: WidgetsData) => {
    remember({ data: value });
    setDataState(value);
  }, []);
  const [off, setOff] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [settingsOf, setSettingsOf] = useState<number | null>(null);
  const [detail, setDetail] = useState<WidgetItem | null>(null);
  const [draft, setDraft] = useState<WidgetItem[]>([]);
  const [resetAsked, setResetAsked] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState(() => remembered().rows);
  // A widget being dragged: what, where the pointer is, and where it would land
  // (undefined: not over the grid; null: over it, but there is no room).
  const [carry, setCarry] = useState<Carry | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [landing, setLanding] = useState<Landing | null | undefined>(undefined);
  const [addCell, setAddCell] = useState<{ row: number; col: number } | null>(null);
  const gridBox = useRef<HTMLDivElement>(null);
  const gridEl = useRef<HTMLDivElement>(null);
  // Set when a drag ends, so the click the browser sends after it does not open the widget's settings.
  const dropped = useRef(false);
  const detailTitle = useId();
  const now = useMinuteClock();

  const loadData = useCallback(async () => {
    const result = await getJson("/api/widgets");
    if (result.ok) setData(result.data as WidgetsData);
    else if (result.status === 401) setOff(true);
  }, [setData]);
  useVisibleInterval(loadData, MINUTE, !off);
  // A saved settings change (time format, time zone) shows in the widgets at once.
  useEffect(() => {
    if (off) return;
    const onSaved = () => void loadData();
    window.addEventListener(SETTINGS_SAVED, onSaved);
    return () => window.removeEventListener(SETTINGS_SAVED, onSaved);
  }, [off, loadData]);

  const ready = data !== null;
  // The weather is asked at the same time as the rest, not after it.
  const weather = useWeather(!off);
  const travel = useTrip(data?.trip?.id ?? null);

  // As many rows as fit in the space between the navigation and the bottom links.
  // Before the browser paints, so the grid never shows with too few rows first.
  useLayoutEffect(() => {
    const box = gridBox.current;
    if (!box) return;
    const measure = () => {
      const fit = rowsFor(box.clientHeight, CELL_PX, GAP_PX);
      remember({ rows: fit });
      setRows(fit);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [ready]);

  // A goal widget whose goal is gone is not shown, and is dropped at the next save (R47).
  const goalIds = useMemo(() => new Set(data?.goals.map((g) => g.id) ?? []), [data]);
  const shown = useCallback((list: WidgetItem[]) => list.filter((w) => w.kind !== "goal" || !w.goalId || goalIds.has(w.goalId)), [goalIds]);
  const saved = useMemo(() => (data ? shown(data.layout) : []), [data, shown]);
  // While dragging, the widget is shown in the field it would land in; a widget of the grid that is
  // not over a place it can land in is shown back where it came from.
  const landingAt = carry ? (landing ? landing.index : carry.from) : undefined;
  const layout = editing ? (carry ? (landing ? landing.layout : (carry.origin ?? draft)) : draft) : saved;
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
  }, [data, draft, resetAsked, saved, setData]);

  // Dragging a widget (in from the gallery, or one of the grid's own): the field under the widget's top
  // left decides the place.
  useEffect(() => {
    if (!carry) return;
    const step = CELL_PX + GAP_PX;
    const spotAt = (x: number, y: number): Landing | null | undefined => {
      const grid = gridEl.current;
      if (!grid || rows === 0) return undefined;
      const box = grid.getBoundingClientRect();
      const slack = 32;
      if (x < box.left - slack || x > box.right + slack || y < box.top - slack || y > box.top + rows * step + slack) return undefined;
      const left = x - carry.dx + CELL_PX / 2;
      const top = y - carry.dy + CELL_PX / 2;
      const cell = {
        row: Math.min(rows - 1, Math.max(0, Math.floor((top - box.top) / step))),
        col: Math.min(GRID_COLUMNS - 1, Math.max(0, Math.floor((left - box.left) / step))),
      };
      return placeAt(draft, carry.item, rows, cell);
    };
    const end = () => {
      dropped.current = true;
      window.setTimeout(() => {
        dropped.current = false;
      }, 0);
      setCarry(null);
      setPointer(null);
      setLanding(undefined);
      document.body.style.removeProperty("cursor");
    };
    const onMove = (event: PointerEvent) => {
      setPointer({ x: event.clientX, y: event.clientY });
      setLanding(spotAt(event.clientX, event.clientY));
    };
    const onUp = (event: PointerEvent) => {
      const spot = spotAt(event.clientX, event.clientY);
      if (spot) {
        setDraft(spot.layout);
        setMessage("");
      } else if (carry.origin) {
        // A widget of the grid let go beside it, or where there is no room: back where it was.
        if (spot === null) setMessage("No room for this widget there on this screen");
        setDraft(carry.origin);
      } else {
        // Let go beside the grid, or where there is no room: back to the gallery.
        if (spot === null) setMessage("No room for this widget there on this screen");
        setAdding(true);
      }
      end();
    };
    const cancel = () => {
      if (carry.origin) setDraft(carry.origin);
      else setAdding(true);
      end();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      cancel();
    };
    document.body.style.cursor = "grabbing";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onKey, true);
      document.body.style.removeProperty("cursor");
    };
  }, [carry, draft, rows]);

  useEffect(() => {
    // Escape inside a dialog closes the dialog only.
    if (!editing || adding || carry || settingsOf !== null) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") void finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, adding, carry, settingsOf, finish]);

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
  // A press on a widget becomes a drag once the pointer has moved a few px; until then a release is a
  // click (its settings). The widget leaves the list while it moves, so the others make room for it.
  const press = (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || carry) return;
    event.preventDefault(); // no text selection while dragging; the click still comes
    const box = event.currentTarget.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const stop = () => {
      window.removeEventListener("pointermove", moved);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    const moved = (next: PointerEvent) => {
      if (Math.hypot(next.clientX - startX, next.clientY - startY) < DRAG_FROM) return;
      stop();
      const item = draft[index];
      if (!item) return;
      setMessage("");
      setSettingsOf(null);
      // The others stay where they are now, also when the widget leaves a hole above them.
      setDraft(pinned(draft, rows).filter((_, i) => i !== index));
      setCarry({
        item,
        origin: draft,
        from: index,
        x: next.clientX,
        y: next.clientY,
        dx: Math.min(Math.max(startX - box.left, 0), box.width),
        dy: Math.min(Math.max(startY - box.top, 0), box.height),
      });
      setPointer({ x: next.clientX, y: next.clientY });
      setLanding(undefined);
    };
    window.addEventListener("pointermove", moved);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  // The arrow keys move a widget one field; where it cannot go, nothing changes.
  const ARROWS: Record<string, { row: number; col: number }> = { ArrowUp: { row: -1, col: 0 }, ArrowDown: { row: 1, col: 0 }, ArrowLeft: { row: 0, col: -1 }, ArrowRight: { row: 0, col: 1 } };
  const onTileKey = (event: KeyboardEvent, index: number) => {
    const by = ARROWS[event.key];
    if (by) setDraft((list) => nudge(list, index, rows, by) ?? list);
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
            <button
              type="button"
              onClick={() => {
                setAddCell(null);
                setAdding(true);
              }}
              className={buttonClass("secondary", "sm", "h-7 gap-1 px-2.5")}
            >
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
          ref={gridEl}
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
                landing={carry !== null && landingAt === index}
                onRemove={() => remove(index)}
                onOpen={() => {
                  if (!dropped.current) setSettingsOf(index);
                }}
                onPress={press(index)}
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
                onClick={() => {
                  setAddCell({ row, col });
                  setAdding(true);
                }}
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
          // Into the "+" field that opened the gallery when it fits there, else at the end.
          const spot = addCell ? placeAt(draft, item, rows, addCell) : null;
          setDraft(spot ? spot.layout : [...draft, item]);
          setAdding(false);
        }}
        onPickUp={(pickUp) => {
          setAdding(false);
          setMessage("");
          setCarry(pickUp);
          setPointer({ x: pickUp.x, y: pickUp.y });
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
      {carry && pointer && (
        // The widget under the pointer while it is dragged in from the gallery.
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 scale-105 rounded-card shadow-pop"
          style={{ left: pointer.x - carry.dx, top: pointer.y - carry.dy, ...pxOf(carry.item.size) }}
        >
          {renderWidget(carry.item, ctx, true)}
        </div>
      )}
      <WidgetDialog open={detailAnswer?.status === "ok"} onClose={() => setDetail(null)} titleId={detailTitle} title="Weather" width="md:max-w-xl">
        {detailAnswer?.status === "ok" && <WeatherDetail weather={detailAnswer.weather} clock={ctx.clock} />}
      </WidgetDialog>
    </section>
  );
}
