"use client";

// The shared calendars the viewer chose to show (spec 53, from spec 29): at most three (R58), remembered
// in this browser only (localStorage, which may be missing or refuse: then nothing is remembered), under
// a key of the signed-in user's own (E15: two accounts on one browser do not share the choice). Each is
// read from the server for the shown days, again when the days change and when the window gets the
// focus back, so a withdrawn share disappears on the next read (R56). Nothing here is ever saved
// anywhere else.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getJson } from "@/lib/client/post-json";
import { keepChosen, toggleChosen, windowOf, type ShownCalendar } from "@/lib/shares/place";
import { MAX_SHOWN_CALENDARS, type SharedCalendarAnswer, type SharedEvent, type SharingPerson } from "@/lib/shares/types";

const CHANGED = "shown-calendars-changed";
/** Used when the browser blocks storage: the choice then lasts until the page reloads. */
const inMemory = new Map<string, string>();

/** "lockedin.shownCalendars:<userId>": the remembered choice of this user in this browser. */
export const shownCalendarsKey = (viewerId: string) => `lockedin.shownCalendars:${viewerId}`;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? inMemory.get(key) ?? null;
  } catch {
    return inMemory.get(key) ?? null;
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

function store(key: string, ids: string[]): void {
  const next = JSON.stringify(ids);
  inMemory.set(key, next);
  try {
    window.localStorage.setItem(key, next);
  } catch {
    // Private mode or storage switched off: the choice is kept in memory only.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * "Show in my calendar" on a person's profile page: adds them to the signed-in user's remembered choice
 * (the same one the calendar's People picker stores) while there is room for another (R58). Returns
 * whether they are now in it.
 */
export function rememberShown(viewerId: string, userId: string): boolean {
  const key = shownCalendarsKey(viewerId);
  const ids = parseStored(readStored(key)).filter((id): id is string => typeof id === "string");
  if (ids.includes(userId)) return true;
  if (ids.length >= MAX_SHOWN_CALENDARS) return false;
  store(key, [...ids, userId]);
  return true;
}

/** Keeps only an answer of the expected shape (the server's allow-list); anything else counts as nothing. */
export function asAnswer(data: unknown): SharedCalendarAnswer | null {
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
 * The shown people: the remembered choice, plus the person the address names ("?share=<id>") unless the
 * user hid them (issue #197), without anybody who no longer shares, at most three (R58).
 */
export function shownIds(remembered: readonly unknown[], named: string | undefined, hiddenNamed: string | null, people: readonly SharingPerson[]): string[] {
  const withNamed = named && named !== hiddenNamed && !remembered.includes(named) ? [...remembered, named] : remembered;
  return keepChosen(withNamed, people);
}

/**
 * A tick or untick in the People picker: the new remembered list, and whether it hid the person the
 * address names (issue #197: the address still names them, so without this they came straight back).
 */
export function afterToggle(chosen: readonly string[], userId: string, named: string | undefined): { ids: string[]; hideNamed: boolean } {
  return { ids: toggleChosen(chosen, userId), hideNamed: userId === named && chosen.includes(userId) };
}

/**
 * `viewerId`: the signed-in user (the key of the remembered choice). `named`: a person the address asks
 * to show ("?share=<id>"); shown on top of the remembered choice while there is room, until unticked.
 */
export function useSharedCalendars(viewerId: string, people: readonly SharingPerson[], days: readonly string[], timeZone: string, named?: string) {
  const key = shownCalendarsKey(viewerId);
  const stored = useSyncExternalStore(subscribe, () => readStored(key), () => null);
  // Issue #197: the person the address names, once unticked, until the address names somebody else.
  const [hiddenNamed, setHiddenNamed] = useState<string | null>(null);
  const chosen = useMemo(() => shownIds(parseStored(stored), named, hiddenNamed, people), [stored, named, hiddenNamed, people]);
  const [answers, setAnswers] = useState<Record<string, SharedCalendarAnswer>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const toggle = useCallback(
    (userId: string) => {
      const { ids, hideNamed } = afterToggle(chosen, userId, named);
      if (hideNamed) setHiddenNamed(userId);
      else if (userId === named) setHiddenNamed(null);
      store(key, ids);
    },
    [key, chosen, named],
  );

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
