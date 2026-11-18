// What the widgets showed last (spec 47), kept in this tab's memory only. Every page draws its own
// sidebar, so without it the widgets would start empty on each page and pop in after the server answered.
// With it they show at once and are brought up to date in the background. Nothing is written to the
// browser's storage, and signing out empties it, so the next account never sees these.
import type { TravelAnswer } from "@/lib/travel/types";
import type { WidgetsData } from "@/lib/widgets/types";
import type { WeatherAnswer } from "@/lib/widgets/weather";

export type WidgetMemory = {
  data: WidgetsData | null;
  /** The weather where the user is (no city). */
  weather: WeatherAnswer | null;
  cities: Record<string, WeatherAnswer>;
  /** The trip to an event, by the event's id; null: no travel time. */
  trips: Record<string, TravelAnswer | null>;
  /** Rows that fit on this screen when last measured. */
  rows: number;
};

const empty = (): WidgetMemory => ({ data: null, weather: null, cities: {}, trips: {}, rows: 0 });

let memory = empty();

export function remembered(): WidgetMemory {
  // The server draws each page for many users: there is never anything remembered.
  return typeof window === "undefined" ? empty() : memory;
}

export function remember(patch: Partial<WidgetMemory>): void {
  if (typeof window === "undefined") return;
  memory = { ...memory, ...patch };
}

/** Called when signing out or deleting the account. */
export function forgetWidgets(): void {
  memory = empty();
}
