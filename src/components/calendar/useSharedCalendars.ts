"use client";

// The shared calendars the viewer chose to show (spec 29): at most three (R51), remembered in this
// browser only (localStorage, which may be missing or refuse: then nothing is remembered). Each is read
// from the server for the shown days, again when the days change and when the window gets the focus
// back, so a withdrawn share disappears on the next read (R48). Nothing here is ever saved anywhere else.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getJson } from "@/lib/client/post-json";
import { keepChosen, toggleChosen, windowOf, type ShownCalendar } from "@/lib/shares/place";
import type { SharedCalendarAnswer, SharedEvent, SharingPerson } from "@/lib/shares/types";

const STORAGE_KEY = "lockedin.shownCalendars";
const CHANGED = "shown-calendars-changed";
/** Used when the browser blocks storage: the choice then lasts until the page reloads. */
let inMemory: string | null = null;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? inMemory;
  } catch {
    return inMemory;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function parseStored(raw: string | null): unknown[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function store(ids: string[]): void {
  const next = JSON.stringify(ids);
  inMemory = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode or storage switched off: the choice is kept in memory only.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Keeps only an answer of the expected shape (the server's allow-list); anything else counts as nothing. */
function asAnswer(data: unknown): SharedCalendarAnswer | null {
  if (!data || typeof data !== "object") return null;
  const { level, events } = data as { level?: unknown; events?: unknown };
  if ((level !== "busy" && level !== "details") || !Array.isArray(events)) return null;
  const clean: SharedEvent[] = [];
  for (const e of events as Record<string, unknown>[]) {
    const text = level === "details" ? { title: typeof e.title === "string" ? e.title : "", location: typeof e.location === "string" ? e.location : null } : {};
    if (e.allDay === true && typeof e.firstDay === "string" && typeof e.lastDay === "string") {
      clean.push({ allDay: true, firstDay: e.firstDay, lastDay: e.lastDay, ...text });
    } else if (e.allDay === false && typeof e.startAt === "string" && typeof e.endAt === "string") {
      clean.push({ allDay: false, startAt: e.startAt, endAt: e.endAt, ...text });
    }
  }
  return { level, events: clean };
}

/**
 * `named`: a person the address asks to show (the People page's "Show in calendar"); shown on top of the
 * remembered choice while there is room.
 */
export function useSharedCalendars(people: readonly SharingPerson[], days: readonly string[], timeZone: string, named?: string) {
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const chosen = useMemo(() => {
    const remembered = parseStored(stored);
    return keepChosen(named && !remembered.includes(named) ? [...remembered, named] : remembered, people);
  }, [stored, named, people]);
  const [answers, setAnswers] = useState<Record<string, SharedCalendarAnswer>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const toggle = useCallback((userId: string) => store(toggleChosen(chosen, userId)), [chosen]);

  // Read again when the window comes back to the front.
  useEffect(() => {
    const onFocus = () => setRefreshKey((k) => k + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const first = days[0];
  const last = days[days.length - 1];
  const chosenKey = chosen.join(",");
  useEffect(() => {
    if (!first || !last || chosen.length === 0) return;
    let cancelled = false;
    const { from, to } = windowOf([first, last], timeZone);
    const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    void Promise.all(
      chosen.map(async (id) => {
        const answer = await getJson(`/api/shares/${encodeURIComponent(id)}/calendar?${query}`);
        return [id, answer.ok ? asAnswer(answer.data) : null] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      // A refused read (the share was withdrawn) shows nothing for that person.
      const next: Record<string, SharedCalendarAnswer> = {};
      for (const [id, answer] of pairs) if (answer) next[id] = answer;
      setAnswers(next);
    });
    return () => {
      cancelled = true;
    };
    // chosenKey stands for chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenKey, first, last, timeZone, refreshKey]);

  const calendars = useMemo<ShownCalendar[]>(
    () =>
      chosen.flatMap((id) => {
        const person = people.find((p) => p.userId === id);
        const answer = answers[id];
        return person && answer ? [{ person, level: answer.level, events: answer.events }] : [];
      }),
    [chosen, people, answers],
  );

  return { chosen, toggle, calendars };
}
