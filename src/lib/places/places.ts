// The places the app shows in a list (address suggestions, the cities of the time zone). Finding them is
// done on the server, by the Google module (src/lib/server/google/places.ts).

/** A place for a list: its address line, and its position when it was looked up exactly (suggestions while typing have none). */
export type PlaceSuggestion = { label: string; lat?: number; lon?: number };

/** A city for the time zone in the settings: where it is, and the time zone the server found there. */
export type CitySuggestion = { label: string; lat: number; lon: number; timeZone: string };
