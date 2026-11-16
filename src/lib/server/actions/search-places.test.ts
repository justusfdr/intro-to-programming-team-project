// Tests for search_places: suggestions for the home address, an event's location and the city of the time
// zone. Google is replaced by a stand-in, so the tests need neither the internet nor a real key.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestApp, read, type TestApp } from "@test/support/app";
import { searchPlaces } from "./search-places";

let app: TestApp;
beforeAll(async () => {
  vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "test-key-not-a-real-one");
  app = await createTestApp();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await app.close();
});

const prediction = (text: string) => ({ placePrediction: { placeId: "x", text: { text } } });
/** Google's answer to the suggestions call (Autocomplete). */
const SUGGESTIONS = { suggestions: [prediction("Rua Augusta 100, Lisbon, Portugal"), prediction("Rua Augusta 101, Lisbon, Portugal")] };
// The stand-in takes the address like the real fetch, so tests can look at what was asked.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const service = (answer: unknown, ok = true) => vi.fn(async (..._asked: unknown[]) => ({ ok, status: ok ? 200 : 500, json: async () => answer }) as Response);
const asked = (fake: ReturnType<typeof service>, call = 0) => JSON.parse(String((fake.mock.calls[call][1] as RequestInit).body));

const ask = (q: string, fetchImpl: typeof fetch, extra = "", headers: Record<string, string> = {}) =>
  searchPlaces(
    new Request(`http://localhost:3000/api/places?q=${encodeURIComponent(q)}${extra}`, {
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin", ...headers },
    }),
    app.deps,
    fetchImpl,
  );

describe("search_places", () => {
  it("gives suggestions to a signed-in user, asking Google's Autocomplete", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service(SUGGESTIONS);
    expect(await read(await ask("Rua Augusta 10", fetchImpl as unknown as typeof fetch))).toEqual({
      status: 200,
      body: { places: [{ label: "Rua Augusta 100, Lisbon, Portugal" }, { label: "Rua Augusta 101, Lisbon, Portugal" }] },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(asked(fetchImpl)).toEqual({ input: "Rua Augusta 10", languageCode: "en" });
  });

  it("gives an empty list when nothing matches (Google answers {})", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    expect(await read(await ask("qqqqqqqq", service({}) as unknown as typeof fetch))).toEqual({ status: 200, body: { places: [] } });
  });

  it("does not ask the service for fewer than 3 or more than 200 characters", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service(SUGGESTIONS);
    for (const q of ["", "  ru ", "x".repeat(201)]) {
      expect(await read(await ask(q, fetchImpl as unknown as typeof fetch))).toEqual({ status: 200, body: { places: [] } });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("says so when Google is down or refuses (502), also for a wrong key (403) or a reached limit (429)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await read(await ask("Rua Augusta", down as unknown as typeof fetch))).toEqual({
      status: 502,
      body: { error: "places_unavailable", message: "Address search is not available right now" },
    });
    expect((await ask("Rua Augusta", service({}, false) as unknown as typeof fetch)).status).toBe(502);
    for (const status of [403, 429]) {
      const refused = vi.fn(async () => ({ ok: false, status, json: async () => ({}) }) as Response);
      expect((await ask("Rua Augusta", refused as unknown as typeof fetch)).status).toBe(502);
    }
    vi.restoreAllMocks();
  });

  it("says the search is not available, and asks nobody, when the server has no Google key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service(SUGGESTIONS);
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "");
    try {
      expect(await read(await ask("Rua Augusta", fetchImpl as unknown as typeof fetch))).toEqual({
        status: 502,
        body: { error: "places_unavailable", message: "Address search is not available right now" },
      });
    } finally {
      vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "test-key-not-a-real-one");
      vi.restoreAllMocks();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a signed-out request (401) without asking the service", async () => {
    await app.reset();
    const fetchImpl = service(SUGGESTIONS);
    expect((await ask("Rua Augusta", fetchImpl as unknown as typeof fetch)).status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a request from another site (403)", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service(SUGGESTIONS);
    const response = await ask("Rua Augusta", fetchImpl as unknown as typeof fetch, "", { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never sends the key or the signed-in user's e-mail to the browser", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const response = await ask("Rua Augusta 100", service(SUGGESTIONS) as unknown as typeof fetch);
    expect(JSON.stringify(await response.json())).not.toMatch(/test-key|alice@example/);
    expect(response.headers.get("x-goog-api-key")).toBeNull();
  });

  it("Confirm (the exact look-up) asks Text Search for one place and keeps the house number Google found", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const madres = { places: [{ formattedAddress: "R. das Madres 66, 1200-863 Lisboa, Portugal", location: { latitude: 38.7, longitude: -9.15 } }] };
    const fetchImpl = service(madres);
    const { body } = await read(await ask("rua das madres 66", fetchImpl as unknown as typeof fetch, "&mode=confirm"));
    expect(body.places).toEqual([{ label: "R. das Madres 66, 1200-863 Lisboa, Portugal", lat: 38.7, lon: -9.15 }]);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(asked(fetchImpl)).toEqual({ textQuery: "rua das madres 66", languageCode: "en", pageSize: 1 });
  });

  it("Confirm says an address Google does not know is not found (empty list)", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    expect(await read(await ask("qqqqq 9999", service({}) as unknown as typeof fetch, "&mode=confirm"))).toEqual({ status: 200, body: { places: [] } });
  });

  it("Confirm is refused when Google is down (502)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    expect((await ask("Rua Augusta 100", service({}, false) as unknown as typeof fetch, "&mode=confirm")).status).toBe(502);
    vi.restoreAllMocks();
  });

  describe("kind=city (the time zone in the settings)", () => {
    const CITIES = { suggestions: [prediction("Lisbon, Portugal"), prediction("Lisburn, UK"), prediction("Lisbon, IA, USA")] };
    const askCity = (q: string, fetchImpl: typeof fetch, exact = false) => ask(q, fetchImpl, `&kind=city${exact ? "&mode=confirm" : ""}`);

    it("while typing: the cities that fit, only the names, asking Google for city kinds only", async () => {
      await app.reset();
      await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
      const fetchImpl = service(CITIES);
      expect(await read(await askCity("Lisb", fetchImpl as unknown as typeof fetch))).toEqual({
        status: 200,
        body: { places: [{ label: "Lisbon, Portugal" }, { label: "Lisburn, UK" }, { label: "Lisbon, IA, USA" }] },
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(asked(fetchImpl)).toEqual({ input: "Lisb", languageCode: "en", includedPrimaryTypes: ["locality", "administrative_area_level_1", "country"] });
    });

    it("Confirm: the city with its time zone at its position", async () => {
      await app.reset();
      await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
      const fetchImpl = service({ places: [{ formattedAddress: "Lisbon, Portugal", location: { latitude: 38.7077507, longitude: -9.1365919 } }] });
      expect(await read(await askCity("Lisbon, Portugal", fetchImpl as unknown as typeof fetch, true))).toEqual({
        status: 200,
        body: { places: [{ label: "Lisbon, Portugal", lat: 38.7077507, lon: -9.1365919, timeZone: "Europe/Lisbon" }] },
      });
      expect(asked(fetchImpl)).toMatchObject({ textQuery: "Lisbon, Portugal", includedType: "locality" });
    });

    it("Confirm: a place with the same name elsewhere gets the time zone of that place (Lisbon in Iowa)", async () => {
      await app.reset();
      await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
      const iowa = { places: [{ formattedAddress: "Lisbon, IA, USA", location: { latitude: 41.9211165, longitude: -91.3854913 } }] };
      const { body } = await read(await askCity("Lisbon, IA, USA", service(iowa) as unknown as typeof fetch, true));
      expect(body.places).toEqual([{ label: "Lisbon, IA, USA", lat: 41.9211165, lon: -91.3854913, timeZone: "America/Chicago" }]);
    });

    it("Confirm: Tokio is found although Google calls Tokyo an administrative area, not a locality", async () => {
      await app.reset();
      await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
      const answers = [{}, { places: [{ formattedAddress: "Tokyo, Japan", location: { latitude: 35.6828387, longitude: 139.7594549 } }] }];
      const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => answers.shift() ?? {} }) as Response);
      expect(await read(await askCity("Tokio", fetchImpl as unknown as typeof fetch, true))).toEqual({
        status: 200,
        body: { places: [{ label: "Tokyo, Japan", lat: 35.6828387, lon: 139.7594549, timeZone: "Asia/Tokyo" }] },
      });
    });

    it("Confirm: an empty list for a city that does not exist", async () => {
      await app.reset();
      await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
      expect(await read(await askCity("Qqqqqville", service({}) as unknown as typeof fetch, true))).toEqual({ status: 200, body: { places: [] } });
    });

    it("Confirm: leaves out a result whose position has no time zone", async () => {
      await app.reset();
      await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
      const broken = { places: [{ formattedAddress: "Nowhere", location: { latitude: 95, longitude: 500 } }] };
      expect(await read(await askCity("Lisbon", service(broken) as unknown as typeof fetch, true))).toEqual({ status: 200, body: { places: [] } });
    });

    it("refuses a signed-out request (401) and says so when Google is down (502)", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      await app.reset();
      const fetchImpl = service(CITIES);
      expect((await askCity("Lisbon", fetchImpl as unknown as typeof fetch)).status).toBe(401);
      expect(fetchImpl).not.toHaveBeenCalled();
      await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
      expect((await askCity("Lisbon", service({}, false) as unknown as typeof fetch)).status).toBe(502);
      expect((await askCity("Lisbon", service({}, false) as unknown as typeof fetch, true)).status).toBe(502);
      vi.restoreAllMocks();
    });
  });
});

