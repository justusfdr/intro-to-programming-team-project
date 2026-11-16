// Tests for the Google module for places. Google is replaced by a stand-in, so no test needs the internet
// or a real key.
import { afterEach, describe, expect, it, vi } from "vitest";
import { CITY_TYPES, GoogleUnavailableError, lookUpPlace, lookupBody, placesFrom, suggestPlaces, suggestionBody, suggestionsFrom } from "./places";

const KEY = "test-key-not-a-real-one";
const LISBON = { formattedAddress: "Rua Augusta 100, 1100-053 Lisboa, Portugal", location: { latitude: 38.7101406, longitude: -9.1373973 } };
const prediction = (text: unknown) => ({ placePrediction: { placeId: "x", text: { text } } });

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const google = (answer: unknown, ok = true, status = ok ? 200 : 403) => vi.fn(async (..._asked: unknown[]) => ({ ok, status, json: async () => answer }) as Response);
const asFetch = (fake: ReturnType<typeof vi.fn>) => fake as unknown as typeof fetch;
const sentBody = (fake: ReturnType<typeof vi.fn>, call = 0) => JSON.parse(String((fake.mock.calls[call][1] as RequestInit).body));

afterEach(() => vi.restoreAllMocks());

describe("suggestionsFrom (Autocomplete answer)", () => {
  it("takes the text of each place suggestion, in Google's order", () => {
    expect(suggestionsFrom({ suggestions: [prediction("Lisbon, Portugal"), prediction("Lisburn, UK")] })).toEqual([{ label: "Lisbon, Portugal" }, { label: "Lisburn, UK" }]);
  });

  it("is empty for an answer without suggestions (Google answers {} when nothing matches) or a strange answer", () => {
    for (const answer of [{}, { suggestions: [] }, { suggestions: "x" }, null, undefined, "x", 5, []]) expect(suggestionsFrom(answer)).toEqual([]);
  });

  it("leaves out suggestions that are not a place suggestion or have no readable text", () => {
    const bad = [{ queryPrediction: { text: { text: "a query" } } }, prediction(""), prediction("   "), prediction(5), { placePrediction: {} }, null, "x"];
    expect(suggestionsFrom({ suggestions: [...bad, prediction("Lisbon, Portugal")] })).toEqual([{ label: "Lisbon, Portugal" }]);
  });

  it("lists a text once, trims it, and stops at the limit", () => {
    const many = Array.from({ length: 8 }, (_, i) => prediction(`Street ${i}`));
    expect(suggestionsFrom({ suggestions: [prediction("A"), prediction(" A ")] })).toEqual([{ label: "A" }]);
    expect(suggestionsFrom({ suggestions: many }, 3).map((p) => p.label)).toEqual(["Street 0", "Street 1", "Street 2"]);
  });
});

describe("placesFrom (Text Search answer)", () => {
  it("keeps results with an address line and a position", () => {
    expect(placesFrom({ places: [LISBON] }, 5)).toEqual([{ label: "Rua Augusta 100, 1100-053 Lisboa, Portugal", lat: 38.7101406, lon: -9.1373973 }]);
  });

  it("is empty for {} or a strange answer", () => {
    for (const answer of [{}, { places: [] }, { places: "x" }, null, undefined, "x", 5, []]) expect(placesFrom(answer)).toEqual([]);
  });

  it("leaves out results without a readable address line or position", () => {
    const bad = [
      { location: { latitude: 1, longitude: 2 } },
      { formattedAddress: "  ", location: { latitude: 1, longitude: 2 } },
      { formattedAddress: 5, location: { latitude: 1, longitude: 2 } },
      { formattedAddress: "No position" },
      { formattedAddress: "Text position", location: { latitude: "1", longitude: "2" } },
      { formattedAddress: "Not a number", location: { latitude: NaN, longitude: 2 } },
      { formattedAddress: "Infinite", location: { latitude: 1, longitude: Infinity } },
      null,
      "x",
    ];
    expect(placesFrom({ places: [...bad, LISBON] }, 5)).toEqual([{ label: LISBON.formattedAddress, lat: 38.7101406, lon: -9.1373973 }]);
  });
});

describe("the bodies sent to Google", () => {
  it("suggestions: the typed text and English labels; for cities also only the city kinds", () => {
    expect(suggestionBody("Rua Augusta", "address")).toEqual({ input: "Rua Augusta", languageCode: "en" });
    expect(suggestionBody("Lisb", "city")).toEqual({ input: "Lisb", languageCode: "en", includedPrimaryTypes: ["locality", "administrative_area_level_1", "country"] });
  });

  it("look-up: the best match only, and optionally one kind of place only", () => {
    expect(lookupBody("Rua Augusta 100")).toEqual({ textQuery: "Rua Augusta 100", languageCode: "en", pageSize: 1 });
    expect(lookupBody("Tokio", "locality")).toEqual({ textQuery: "Tokio", languageCode: "en", pageSize: 1, includedType: "locality", strictTypeFiltering: true });
  });
});

describe("suggestPlaces", () => {
  it("sends one request to the Autocomplete API with the key and the field list in headers, and returns the labels", async () => {
    const fake = google({ suggestions: [prediction("Rua Augusta 100, Lisbon, Portugal")] });
    expect(await suggestPlaces("Rua Augusta 10", { kind: "address", key: KEY, fetchImpl: asFetch(fake) })).toEqual([{ label: "Rua Augusta 100, Lisbon, Portugal" }]);
    expect(fake).toHaveBeenCalledOnce();
    const [url, init] = fake.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "suggestions.placePrediction.text.text" });
    expect(sentBody(fake)).toEqual({ input: "Rua Augusta 10", languageCode: "en" });
  });

  it("never puts the key in the address or the body", async () => {
    const fake = google({});
    await suggestPlaces("Lisb", { kind: "city", key: KEY, fetchImpl: asFetch(fake) });
    const [url, init] = fake.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(KEY);
    expect(String(init.body)).not.toContain(KEY);
  });

  it("is an empty list when Google finds nothing", async () => {
    expect(await suggestPlaces("qqqqqqq", { kind: "address", key: KEY, fetchImpl: asFetch(google({})) })).toEqual([]);
  });
});

describe("lookUpPlace", () => {
  it("sends one request to the Text Search API and returns the place with its position", async () => {
    const fake = google({ places: [LISBON] });
    expect(await lookUpPlace("Rua Augusta 100", { kind: "address", key: KEY, fetchImpl: asFetch(fake) })).toEqual([
      { label: LISBON.formattedAddress, lat: 38.7101406, lon: -9.1373973 },
    ]);
    expect(fake).toHaveBeenCalledOnce();
    const [url, init] = fake.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "places.formattedAddress,places.location" });
    expect(sentBody(fake)).toEqual({ textQuery: "Rua Augusta 100", languageCode: "en", pageSize: 1 });
  });

  it("an address nobody finds is an empty list, after one call only", async () => {
    const fake = google({});
    expect(await lookUpPlace("qqqqqqq", { kind: "address", key: KEY, fetchImpl: asFetch(fake) })).toEqual([]);
    expect(fake).toHaveBeenCalledOnce();
  });

  it("a city is looked up as a locality first and stops when it is found", async () => {
    const fake = google({ places: [{ formattedAddress: "Lisbon, Portugal", location: { latitude: 38.72, longitude: -9.14 } }] });
    expect(await lookUpPlace("Lisbon", { kind: "city", key: KEY, fetchImpl: asFetch(fake) })).toEqual([{ label: "Lisbon, Portugal", lat: 38.72, lon: -9.14 }]);
    expect(fake).toHaveBeenCalledOnce();
    expect(sentBody(fake)).toMatchObject({ includedType: "locality", strictTypeFiltering: true });
  });

  it("a city that Google does not call a locality (Tokyo, Singapore) is found by the next kind", async () => {
    const answers = [{}, { places: [{ formattedAddress: "Tokyo, Japan", location: { latitude: 35.68, longitude: 139.76 } }] }];
    const fake = vi.fn(async () => ({ ok: true, status: 200, json: async () => answers.shift() ?? {} }) as Response);
    expect(await lookUpPlace("Tokio", { kind: "city", key: KEY, fetchImpl: asFetch(fake) })).toEqual([{ label: "Tokyo, Japan", lat: 35.68, lon: 139.76 }]);
    expect(fake).toHaveBeenCalledTimes(2);
    expect(sentBody(fake, 0).includedType).toBe("locality");
    expect(sentBody(fake, 1).includedType).toBe("administrative_area_level_1");
  });

  it("a city that no kind finds is an empty list after every kind was tried", async () => {
    const fake = google({});
    expect(await lookUpPlace("Qqqqqville", { kind: "city", key: KEY, fetchImpl: asFetch(fake) })).toEqual([]);
    expect(fake.mock.calls.map((_, i) => sentBody(fake, i).includedType)).toEqual([...CITY_TYPES]);
  });

  it("stops at the first failure instead of asking again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = google({}, false, 429);
    await expect(lookUpPlace("Lisbon", { kind: "city", key: KEY, fetchImpl: asFetch(fake) })).rejects.toBeInstanceOf(GoogleUnavailableError);
    expect(fake).toHaveBeenCalledOnce();
  });
});

describe("failures (both calls)", () => {
  const calls = [
    ["suggestPlaces", (search: Parameters<typeof suggestPlaces>[1]) => suggestPlaces("Rua Augusta", search)],
    ["lookUpPlace", (search: Parameters<typeof lookUpPlace>[1]) => lookUpPlace("Rua Augusta", search)],
  ] as const;

  it.each(calls)("%s does not ask Google at all without a key", async (_name, call) => {
    const fake = google({ suggestions: [], places: [] });
    for (const key of [null, ""]) await expect(call({ kind: "address", key, fetchImpl: asFetch(fake) })).rejects.toBeInstanceOf(GoogleUnavailableError);
    expect(fake).not.toHaveBeenCalled();
  });

  it.each(calls)("%s is unavailable when Google refuses (wrong key 403, limit 429, outage 500)", async (_name, call) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const status of [400, 403, 429, 500, 503]) {
      await expect(call({ kind: "address", key: KEY, fetchImpl: asFetch(google({}, false, status)) })).rejects.toThrow(`status ${status}`);
    }
  });

  it.each(calls)("%s is unavailable when Google does not answer or answers something that is not JSON", async (_name, call) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(call({ kind: "address", key: KEY, fetchImpl: asFetch(down) })).rejects.toBeInstanceOf(GoogleUnavailableError);
    const broken = vi.fn(async () => ({ ok: true, status: 200, json: async () => Promise.reject(new Error("not json")) }) as unknown as Response);
    await expect(call({ kind: "address", key: KEY, fetchImpl: asFetch(broken) })).rejects.toBeInstanceOf(GoogleUnavailableError);
  });

  it.each(calls)("%s logs only the kind of failure and the status, never the key or the search", async (_name, call) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = await call({ kind: "address", key: KEY, fetchImpl: asFetch(google({}, false, 403)) }).catch((e: Error) => e);
    expect(log).toHaveBeenCalledOnce();
    const logged = JSON.stringify(log.mock.calls) + String((error as Error).message);
    expect(logged).toContain("403");
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain("Rua Augusta");
  });
});
