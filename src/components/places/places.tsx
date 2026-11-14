"use client";

// Address search for the browser, shared by the home address in the settings and an event's location:
// asking our server (/api/places), the suggestions while typing, and the list under the field.
// The server does the actual asking of the OpenStreetMap-based services (src/lib/server/actions/search-places.ts).
import { useEffect, useState } from "react";
import type { PlaceSuggestion } from "@/lib/places/places";

/**
 * Suggestions for what is typed, or null when the search is not available. `exact` is the look-up of one
 * address (the Confirm button and the "Look up" row): it also finds streets the suggestions miss.
 */
export async function lookUp(query: string, signal?: AbortSignal, exact = false): Promise<PlaceSuggestion[] | null> {
  try {
    const response = await fetch(`/api/places?q=${encodeURIComponent(query)}${exact ? "&mode=confirm" : ""}`, { signal });
    if (!response.ok) return null;
    return ((await response.json()) as { places: PlaceSuggestion[] }).places;
  } catch {
    return null;
  }
}

/**
 * The exact look-up of `text`, or "stale" when the field no longer holds that text once the answer is
 * there (`current` reads the field now): the answer is then dropped, so it never overwrites what was typed since.
 */
export async function lookUpCurrent(text: string, current: () => string): Promise<PlaceSuggestion[] | null | "stale"> {
  const answer = await lookUp(text, undefined, true);
  return current().trim() === text ? answer : "stale";
}

/**
 * The suggestions for `typed`, asked a moment after the last key. Nothing is asked for fewer than three
 * characters or while `skip` is true (for example the text is a saved or chosen address). Suggestions for
 * older text are never shown.
 */
export function usePlaceSuggestions(typed: string, skip: boolean): PlaceSuggestion[] {
  const [found, setFound] = useState<{ query: string; places: PlaceSuggestion[] }>({ query: "", places: [] });
  useEffect(() => {
    if (typed.length < 3 || skip) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const places = await lookUp(typed, controller.signal);
      if (!controller.signal.aborted) setFound({ query: typed, places: places ?? [] });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typed, skip]);
  return found.query === typed && !skip ? found.places : [];
}

/**
 * The list under an address field: the suggestions, and always a last row that looks up exactly what was
 * typed (for an address the suggestions miss, such as a house number OpenStreetMap does not know).
 * `active` is the row chosen with the arrow keys; the last row has the index `suggestions.length`.
 */
export function PlaceList({
  id,
  suggestions,
  typed,
  active,
  onPick,
  onLookUp,
}: {
  id: string;
  suggestions: PlaceSuggestion[];
  typed: string;
  active: number;
  onPick: (place: PlaceSuggestion) => void;
  onLookUp: () => void;
}) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Address suggestions"
      className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
    >
      {suggestions.map((place, i) => (
        <li
          key={place.label}
          role="option"
          aria-selected={i === active}
          // mousedown, not click: the choice must happen before the field loses focus.
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(place);
          }}
          className={`cursor-pointer px-3 py-2 text-sm text-ink ${i === active ? "bg-raised" : "hover:bg-raised"}`}
        >
          {place.label}
        </li>
      ))}
      <li
        role="option"
        aria-selected={active === suggestions.length}
        onMouseDown={(e) => {
          e.preventDefault();
          onLookUp();
        }}
        className={`cursor-pointer border-t border-line-subtle px-3 py-2 text-sm text-ink-2 ${active === suggestions.length ? "bg-raised" : "hover:bg-raised"}`}
      >
        {suggestions.length === 0 ? "Look up" : "Not listed? Look up"} “{typed}”
      </li>
    </ul>
  );
}

/** The arrow keys move through the list's rows (the suggestions and the "Look up" row), round and round. */
export function nextRow(active: number, rows: number, key: "ArrowDown" | "ArrowUp"): number {
  if (rows <= 0) return -1;
  return key === "ArrowDown" ? (active + 1) % rows : active <= 0 ? rows - 1 : active - 1;
}

/** The field's colours: green for a moment after an address was found, red (and a shake) when it was not. */
export function checkClass(state: "idle" | "checking" | "found" | "missing"): string {
  if (state === "found") return "border-success bg-success-soft ring-2 ring-success/40";
  if (state === "missing") return "address-shake border-danger bg-danger-soft ring-2 ring-danger/40";
  return "";
}
