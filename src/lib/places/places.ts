// Address suggestions from OpenStreetMap data (the Photon search service). This file only turns the
// service's answer into short lines for a list; asking the service is done in the server action.

export type PlaceSuggestion = { label: string; lat: number; lon: number };

type PhotonFeature = {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** "Rua Augusta 100, 1100-050 Lisboa, Portugal" from the parts a result has, or "" if it has too little. */
export function labelOf(p: Record<string, unknown>): string {
  const street = text(p.street);
  const number = text(p.housenumber);
  const first = street ? (number ? `${street} ${number}` : street) : text(p.name);
  const town = [text(p.postcode), text(p.city) || text(p.town) || text(p.village) || text(p.county)].filter(Boolean).join(" ");
  const parts = [first, town, text(p.country)].filter(Boolean);
  // Drop a part that repeats the one before it ("Lisboa, Lisboa").
  const unique = parts.filter((part, i) => part !== parts[i - 1]);
  return unique.length >= 2 ? unique.join(", ") : "";
}

/** The suggestions in a Photon answer: only results with a readable label and a position, no repeats. */
export function suggestionsFrom(answer: unknown, limit = 5): PlaceSuggestion[] {
  const features = (answer as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const seen = new Set<string>();
  const found: PlaceSuggestion[] = [];
  for (const feature of features as PhotonFeature[]) {
    const [lon, lat] = Array.isArray(feature?.geometry?.coordinates) ? (feature.geometry.coordinates as unknown[]) : [];
    const label = feature?.properties ? labelOf(feature.properties) : "";
    if (!label || typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    found.push({ label, lat, lon });
    if (found.length === limit) break;
  }
  return found;
}

/** A city for the time zone in the settings: where it is, and the time zone the server found there. */
export type CitySuggestion = PlaceSuggestion & { timeZone: string };

/** "Lisbon, Portugal" or "Paris, Texas, United States": the city, its region when that has another name, the country. */
export function cityLabelOf(p: Record<string, unknown>): string {
  const name = text(p.name);
  const region = text(p.state) || text(p.county);
  const country = text(p.country);
  if (!name || !country) return "";
  return [name, region !== name && region !== country ? region : "", country].filter(Boolean).join(", ");
}

/** The cities in a Photon answer (asked with layer=city): only results with a name, a country and a position, no repeats. */
export function citiesFrom(answer: unknown, limit = 5): PlaceSuggestion[] {
  const features = (answer as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const seen = new Set<string>();
  const found: PlaceSuggestion[] = [];
  for (const feature of features as PhotonFeature[]) {
    const [lon, lat] = Array.isArray(feature?.geometry?.coordinates) ? (feature.geometry.coordinates as unknown[]) : [];
    const label = feature?.properties ? cityLabelOf(feature.properties) : "";
    if (!label || typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    found.push({ label, lat, lon });
    if (found.length === limit) break;
  }
  return found;
}

/** The house number someone typed ("rua das madres 66" → "66"), or "". A postcode like 1200-861 is not one. */
export function houseNumberIn(typed: string): string {
  return /(?:^|[\s,])(\d{1,4}[A-Za-z]?)(?=$|[\s,])/.exec(typed)?.[1] ?? "";
}

type NominatimResult = { lat?: unknown; lon?: unknown; name?: unknown; address?: Record<string, unknown> };

/**
 * The best match in a Nominatim answer, with the house number that was typed. OpenStreetMap does not know
 * every house number: when it finds the street but not the number, the typed number is kept on the street's
 * position (a little less exact, but the address is real).
 */
export function confirmedFrom(answer: unknown, typed: string): PlaceSuggestion | null {
  if (!Array.isArray(answer)) return null;
  for (const hit of answer as NominatimResult[]) {
    const a = hit?.address ?? {};
    const lat = Number(hit?.lat);
    const lon = Number(hit?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const road = text(a.road) || text(a.pedestrian) || text(a.footway);
    const label = labelOf({
      name: road ? "" : hit.name,
      street: road,
      housenumber: text(a.house_number) || (road ? houseNumberIn(typed) : ""),
      postcode: a.postcode,
      city: text(a.city) || text(a.town) || text(a.village) || text(a.municipality),
      country: a.country,
    });
    if (label) return { label, lat, lon };
  }
  return null;
}

const words = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * Whether a suggestion fits what was typed. The search service guesses freely ("rua das madres" → "Rua das
 * Madressilvas" in Brazil), so the longest typed word (usually the street's name) must be in the suggestion as
 * a whole word. Only while that word is still being typed (it is the last thing typed) is its start enough.
 */
export function fitsTyped(label: string, typed: string): boolean {
  const typedWords = words(typed);
  const lettered = typedWords.filter((w) => /\p{L}/u.test(w));
  if (lettered.length === 0) return true;
  const key = lettered.reduce((a, b) => (b.length > a.length ? b : a));
  const stillTyping = typedWords[typedWords.length - 1] === key && !/[\s,]$/.test(typed);
  return words(label).some((w) => w === key || (stillTyping && w.startsWith(key)));
}
