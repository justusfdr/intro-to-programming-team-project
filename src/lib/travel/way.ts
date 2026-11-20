// How the user gets to a place, and the buffer for it (asked for on 20 Nov 2026). Each saved place and
// home can have its own way and buffer; whatever is not set there, and every other address, takes "Other"
// (the settings' travel_mode and travel_buffer_minutes). Pure, so the server (travel times, the coach's
// events) and the event editor (its "(default)" way) agree; tested in way.test.ts.
import type { SavedPlace } from "@/lib/places/saved";
import type { TravelMode } from "@/lib/settings/types";

/** Two addresses written the same way (case, spaces and commas aside). */
export function sameAddress(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[\s,]+/g, " ").trim();
  return norm(a) === norm(b);
}

/** What the way to a place depends on: "Other", home and the saved places. */
export type WayDefaults = {
  travelMode: TravelMode;
  travelBufferMinutes: number;
  homeAddress: string;
  homeTravelMode: TravelMode | null;
  homeTravelBufferMinutes: number | null;
};

export type Way = { mode: TravelMode; bufferMinutes: number };

/**
 * The way and buffer to `location`: home's own when it is the home address, a saved place's own when it
 * is that place's address, else (and for whatever is not set there) "Other".
 */
export function wayTo(location: string, defaults: WayDefaults, places: Pick<SavedPlace, "address" | "travelMode" | "bufferMinutes">[]): Way {
  const other: Way = { mode: defaults.travelMode, bufferMinutes: defaults.travelBufferMinutes };
  const there = location.trim();
  if (there === "") return other;
  if (defaults.homeAddress.trim() !== "" && sameAddress(defaults.homeAddress, there)) {
    return { mode: defaults.homeTravelMode ?? other.mode, bufferMinutes: defaults.homeTravelBufferMinutes ?? other.bufferMinutes };
  }
  const place = places.find((p) => sameAddress(p.address, there));
  if (place) return { mode: place.travelMode ?? other.mode, bufferMinutes: place.bufferMinutes ?? other.bufferMinutes };
  return other;
}
