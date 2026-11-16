import "server-only";

// The map of the way to an event (R27), from Google's Maps Embed API: the address of a Google page that
// the editor shows in a frame. Google draws the route from the home address to the event's location
// itself; we send nothing else. The Embed API costs nothing. It needs the browser key
// (GOOGLE_MAPS_BROWSER_KEY), which is public by design: it is in the page, and Google accepts it only from
// our own addresses and only for the map (restricted in the Google Cloud Console). The server key never
// goes into this address.
import type { TravelMode } from "@/lib/settings/types";

const EMBED_DIRECTIONS = "https://www.google.com/maps/embed/v1/directions";

/** Google's names for our ways of getting there. */
const EMBED_MODE: Record<TravelMode, string> = { driving: "driving", cycling: "bicycling", walking: "walking", transit: "transit" };

/** The address of the map from `from` to `to`, or null without a key or an address. */
export function routeMapUrl(from: string, to: string, mode: TravelMode, key: string | null): string | null {
  const origin = from.trim();
  const destination = to.trim();
  if (!key || !origin || !destination) return null;
  return `${EMBED_DIRECTIONS}?${new URLSearchParams({ key, origin, destination, mode: EMBED_MODE[mode], language: "en" })}`;
}
