import "server-only";

// The time zone at a place on the map, for choosing the time zone by city in the settings. This is no
// service on the internet: a small library (@photostructure/tz-lookup) holds a map of the world's time
// zones and answers here on our server.
import tzLookup from "@photostructure/tz-lookup";
import { knownTimeZone } from "@/lib/server/actions/update-settings";

/** The time zone at this position, in the name the server knows ("Europe/Kyiv" → "Europe/Kiev"), or null. */
export function timeZoneAt(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  try {
    return knownTimeZone(tzLookup(lat, lon));
  } catch {
    return null;
  }
}
