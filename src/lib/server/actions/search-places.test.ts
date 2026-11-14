// Tests for search_places: suggestions for the home address. The search service is replaced by a stand-in,
// so the tests need no internet.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestApp, read, type TestApp } from "@test/support/app";
import { searchPlaces } from "./search-places";

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});

const ANSWER = {
  features: [
    {
      geometry: { coordinates: [-9.1373973, 38.7101406] },
      properties: { street: "Rua Augusta", housenumber: "100", postcode: "1100-050", city: "Lisboa", country: "Portugal" },
    },
  ],
};
// The stand-in takes the address like the real fetch, so tests can look at what was asked.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const service = (answer: unknown, ok = true) => vi.fn(async (..._asked: unknown[]) => ({ ok, status: ok ? 200 : 500, json: async () => answer }) as Response);

const ask = (q: string, fetchImpl: typeof fetch, headers: Record<string, string> = {}) =>
  searchPlaces(
    new Request(`http://localhost:3000/api/places?q=${encodeURIComponent(q)}`, {
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin", ...headers },
    }),
    app.deps,
    fetchImpl,
  );

describe("search_places", () => {
  it("gives suggestions to a signed-in user", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service(ANSWER);
    expect(await read(await ask("Rua Augusta 100", fetchImpl as unknown as typeof fetch))).toEqual({
      status: 200,
      body: { places: [{ label: "Rua Augusta 100, 1100-050 Lisboa, Portugal", lat: 38.7101406, lon: -9.1373973 }] },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("gives an empty list when nothing matches", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    expect(await read(await ask("qqqqqqqq", service({ features: [] }) as unknown as typeof fetch))).toEqual({ status: 200, body: { places: [] } });
  });

  it("does not ask the service for fewer than 3 or more than 200 characters", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service(ANSWER);
    for (const q of ["", "  ru ", "x".repeat(201)]) {
      expect(await read(await ask(q, fetchImpl as unknown as typeof fetch))).toEqual({ status: 200, body: { places: [] } });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("says so when the search service is down (502)", async () => {
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
  });

  it("rejects a signed-out request (401) without asking the service", async () => {
    await app.reset();
    const fetchImpl = service(ANSWER);
    expect((await ask("Rua Augusta", fetchImpl as unknown as typeof fetch)).status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a request from another site (403)", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service(ANSWER);
    const response = await ask("Rua Augusta", fetchImpl as unknown as typeof fetch, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Confirm asks Nominatim first and keeps the typed house number", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service([{ lat: "38.70", lon: "-9.15", address: { road: "Rua das Madres", postcode: "1200-863", city: "Lisboa", country: "Portugal" } }]);
    const request = new Request(`http://localhost:3000/api/places?q=${encodeURIComponent("rua das madres 66")}&mode=confirm`, {
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
    });
    expect(await read(await searchPlaces(request, app.deps, fetchImpl as unknown as typeof fetch))).toEqual({
      status: 200,
      body: { places: [{ label: "Rua das Madres 66, 1200-863 Lisboa, Portugal", lat: 38.7, lon: -9.15 }] },
    });
    expect(String(fetchImpl.mock.calls[0][0])).toContain("nominatim.openstreetmap.org");
  });

  describe("kind=city (the time zone in the settings)", () => {
    const CITIES = {
      features: [
        { geometry: { coordinates: [-9.1365919, 38.7077507] }, properties: { name: "Lisbon", county: "Lisbon", country: "Portugal", osm_value: "city" } },
        { geometry: { coordinates: [-6.046717, 54.5112856] }, properties: { name: "Lisburn", state: "Northern Ireland", country: "United Kingdom" } },
        { geometry: { coordinates: [-91.3854913, 41.9211165] }, properties: { name: "Lisbon", state: "Iowa", country: "United States" } },
      ],
    };
    const askCity = (q: string, fetchImpl: typeof fetch) =>
      searchPlaces(
        new Request(`http://localhost:3000/api/places?q=${encodeURIComponent(q)}&kind=city`, {
          headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
        }),
        app.deps,
        fetchImpl,
      );

    it("gives the cities the service found, each with its time zone, and asks Photon for cities only", async () => {
      await app.reset();
      await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
      const fetchImpl = service(CITIES);
      expect(await read(await askCity("Lisbon", fetchImpl as unknown as typeof fetch))).toEqual({
        status: 200,
        body: {
          places: [
            { label: "Lisbon, Portugal", lat: 38.7077507, lon: -9.1365919, timeZone: "Europe/Lisbon" },
            { label: "Lisburn, Northern Ireland, United Kingdom", lat: 54.5112856, lon: -6.046717, timeZone: "Europe/London" },
            { label: "Lisbon, Iowa, United States", lat: 41.9211165, lon: -91.3854913, timeZone: "America/Chicago" },
          ],
        },
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
      const asked = new URL(String(fetchImpl.mock.calls[0][0]));
      expect(asked.hostname).toBe("photon.komoot.io");
      expect(asked.searchParams.get("layer")).toBe("city");
    });

    it("keeps a city found by its name in another language (Tokio → Tokyo), which the address filter would drop", async () => {
      await app.reset();
      await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
      const tokyo = { features: [{ geometry: { coordinates: [139.7594549, 35.6828387] }, properties: { name: "Tokyo", country: "Japan", osm_value: "city" } }] };
      expect(await read(await askCity("Tokio", service(tokyo) as unknown as typeof fetch))).toEqual({
        status: 200,
        body: { places: [{ label: "Tokyo, Japan", lat: 35.6828387, lon: 139.7594549, timeZone: "Asia/Tokyo" }] },
      });
    });

    it("gives an empty list for a city that does not exist", async () => {
      await app.reset();
      await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
      expect(await read(await askCity("Qqqqqville", service({ features: [] }) as unknown as typeof fetch))).toEqual({ status: 200, body: { places: [] } });
    });

    it("leaves out a result whose position has no time zone", async () => {
      await app.reset();
      await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
      const broken = { features: [{ geometry: { coordinates: [500, 95] }, properties: { name: "Lisbon", country: "Portugal" } }] };
      expect(await read(await askCity("Lisbon", service(broken) as unknown as typeof fetch))).toEqual({ status: 200, body: { places: [] } });
    });

    it("refuses a signed-out request (401) and says so when the service is down (502)", async () => {
      await app.reset();
      const fetchImpl = service(CITIES);
      expect((await askCity("Lisbon", fetchImpl as unknown as typeof fetch)).status).toBe(401);
      expect(fetchImpl).not.toHaveBeenCalled();
      await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
      expect((await askCity("Lisbon", service({}, false) as unknown as typeof fetch)).status).toBe(502);
    });
  });

  it("Confirm falls back to Photon when Nominatim finds nothing", async () => {
    await app.reset();
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = vi.fn(async (url: unknown) => ({ ok: true, status: 200, json: async () => (String(url).includes("nominatim") ? [] : ANSWER) }) as Response);
    const request = new Request("http://localhost:3000/api/places?q=Rua%20Augusta%20100&mode=confirm", {
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
    });
    const { body } = await read(await searchPlaces(request, app.deps, fetchImpl as unknown as typeof fetch));
    expect((body.places as unknown[]).length).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
