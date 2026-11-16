import "server-only";

// The Google module for places: the only place that talks to Google's Places API (AGENTS.md: one module
// per service). Used for the address suggestions and the exact look-up (home address, an event's
// location) and for the cities of the time zone in the settings. Plain `fetch`, 5 seconds at most. The
// key comes from config.ts and is never logged: only the kind of a failure and its HTTP status are.
// Google's terms do not allow mixing its results with another map service, so this replaces the
// OpenStreetMap services (Photon, Nominatim) for places.
//
// Two calls, each for what it is good at:
// - suggestions while typing: "Autocomplete (New)". It completes half-typed words ("Lisb" → "Lisbon") but
//   gives no position.
// - the exact look-up ("Confirm", and the position of a chosen city): "Text Search (New)". It wants whole
//   words, and answers with the position.
import type { PlaceSuggestion } from "@/lib/places/places";
import { type DailyCounter, sharedDailyCounter } from "./daily-limit";

const AUTOCOMPLETE = "https://places.googleapis.com/v1/places:autocomplete";
const SEARCH_TEXT = "https://places.googleapis.com/v1/places:searchText";
const TIMEOUT_MS = 5000;
/** Only what we show: the text of each suggestion. Asking for less costs less. */
const SUGGESTION_FIELDS = "suggestions.placePrediction.text.text";
/** Only what we use: the address line and the position. */
const LOOKUP_FIELDS = "places.formattedAddress,places.location";
/**
 * What counts as a "city" for the time zone, most specific first. Tokyo is an "administrative area" and
 * Singapore a "country" for Google, so a look-up that finds nothing as a city tries the next kind.
 */
export const CITY_TYPES = ["locality", "administrative_area_level_1", "country"] as const;

/** Why a search could not be answered: no key, no answer, Google refused (key, limit), or an answer we cannot read. */
export class GoogleUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`Google Places is not available (${reason}).`);
    this.name = "GoogleUnavailableError";
  }
}

export type PlaceKind = "address" | "city";

export type PlaceSearch = {
  /** "address": any place or address. "city": only cities and towns (for the time zone). */
  kind: PlaceKind;
  /** Google's server key. Null when it is not set on this server. */
  key: string | null;
  fetchImpl?: typeof fetch;
  /** Our daily brake on Google calls (daily-limit.ts); the server's shared one when not given. */
  counter?: DailyCounter;
};

/** The suggestions in Google's answer: the text of each place suggestion, no repeats, at most `limit`. */
export function suggestionsFrom(answer: unknown, limit = 5): PlaceSuggestion[] {
  const suggestions = (answer as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(suggestions)) return [];
  const seen = new Set<string>();
  const found: PlaceSuggestion[] = [];
  for (const suggestion of suggestions as Record<string, unknown>[]) {
    const text = (suggestion?.placePrediction as { text?: { text?: unknown } } | undefined)?.text?.text;
    const label = typeof text === "string" ? text.trim() : "";
    if (!label || seen.has(label)) continue;
    seen.add(label);
    found.push({ label });
    if (found.length === limit) break;
  }
  return found;
}

/** The places in Google's look-up answer: only results with an address line and a position, no repeats. */
export function placesFrom(answer: unknown, limit = 1): PlaceSuggestion[] {
  const places = (answer as { places?: unknown })?.places;
  if (!Array.isArray(places)) return [];
  const seen = new Set<string>();
  const found: PlaceSuggestion[] = [];
  for (const place of places as Record<string, unknown>[]) {
    const label = typeof place?.formattedAddress === "string" ? place.formattedAddress.trim() : "";
    const location = place?.location as { latitude?: unknown; longitude?: unknown } | undefined;
    const lat = location?.latitude;
    const lon = location?.longitude;
    if (!label || typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    found.push({ label, lat, lon });
    if (found.length === limit) break;
  }
  return found;
}

/** The body of the suggestions call: the typed text, English labels, and for cities only the city kinds. */
export function suggestionBody(query: string, kind: PlaceKind): Record<string, unknown> {
  return { input: query, languageCode: "en", ...(kind === "city" ? { includedPrimaryTypes: [...CITY_TYPES] } : {}) };
}

/** The body of the look-up: the typed text, English labels, the best match, and optionally one kind of place only. */
export function lookupBody(query: string, type?: string): Record<string, unknown> {
  return { textQuery: query, languageCode: "en", pageSize: 1, ...(type ? { includedType: type, strictTypeFiltering: true } : {}) };
}

/** One call to Google. Throws GoogleUnavailableError when Google cannot be asked or does not answer. */
async function post(url: string, fields: string, body: Record<string, unknown>, { key, fetchImpl = fetch, counter = sharedDailyCounter }: Pick<PlaceSearch, "key" | "fetchImpl" | "counter">): Promise<unknown> {
  if (!key) throw new GoogleUnavailableError("no key");
  try {
    if (!counter.take(new Date())) throw new GoogleUnavailableError("daily limit");
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fields },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new GoogleUnavailableError(`status ${response.status}`);
    return await response.json();
  } catch (error) {
    const failure = error instanceof GoogleUnavailableError ? error : new GoogleUnavailableError("no answer");
    console.error(`[google-places] ${failure.reason}`);
    throw failure;
  }
}

/** Suggestions for half-typed text (no position yet; see lookUpPlace). Up to 5. */
export async function suggestPlaces(query: string, search: PlaceSearch): Promise<PlaceSuggestion[]> {
  return suggestionsFrom(await post(AUTOCOMPLETE, SUGGESTION_FIELDS, suggestionBody(query, search.kind), search));
}

/**
 * The best match for the typed text, with its position: an empty list when Google finds nothing. For a
 * city, the kinds of CITY_TYPES are tried one after the other until one finds something.
 */
export async function lookUpPlace(query: string, search: PlaceSearch): Promise<PlaceSuggestion[]> {
  for (const type of search.kind === "city" ? CITY_TYPES : [undefined]) {
    const found = placesFrom(await post(SEARCH_TEXT, LOOKUP_FIELDS, lookupBody(query, type), search));
    if (found.length > 0) return found;
  }
  return [];
}
