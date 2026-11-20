// The user's saved places besides the home address ("Uni", "Gym"), and where the trip to an event starts.

import type { TravelMode } from "@/lib/settings/types";

/**
 * A saved place as the pages get it. travelMode and bufferMinutes: how the user gets there; empty (null or
 * missing) means "as Other", the settings' way and buffer (src/lib/travel/way.ts).
 */
export type SavedPlace = { id: string; name: string; address: string; travelMode?: TravelMode | null; bufferMinutes?: number | null };

/** At most this many saved places per user (the database checks it too). */
export const MAX_PLACES = 10;
export const MAX_PLACE_NAME = 40;
export const MAX_PLACE_ADDRESS = 300;

/**
 * Where the trip to an event starts. null is the standard: the place of the event before it, else home.
 * Stored as text: "home", "last", "place:<id>" or "address:<address>".
 */
export type TravelFrom = { kind: "home" } | { kind: "last" } | { kind: "place"; id: string } | { kind: "address"; address: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The stored text for a choice, or null when it is not a valid one. */
export function travelFromText(from: TravelFrom | null): string | null {
  if (!from) return null;
  if (from.kind === "home" || from.kind === "last") return from.kind;
  if (from.kind === "place") return UUID.test(from.id) ? `place:${from.id.toLowerCase()}` : null;
  const address = from.address.trim();
  return address.length >= 1 && address.length <= MAX_PLACE_ADDRESS ? `address:${address}` : null;
}

/** The choice for a stored text; unknown text is the standard. */
export function travelFromOf(text: string | null | undefined): TravelFrom | null {
  if (!text) return null;
  if (text === "home" || text === "last") return { kind: text };
  if (text.startsWith("place:") && UUID.test(text.slice(6))) return { kind: "place", id: text.slice(6) };
  if (text.startsWith("address:") && text.length > 8) return { kind: "address", address: text.slice(8) };
  return null;
}
