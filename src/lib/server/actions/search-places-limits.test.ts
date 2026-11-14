// Tests for the limits of search_places: at most 30 searches per user per minute, and the exact look-up
// ("Confirm") waits its turn in the shared Nominatim queue. The search services are replaced by stand-ins.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, read, type TestApp } from "@test/support/app";
import { searchPlaces } from "./search-places";

// The real queue, watched: every call is counted and then passed on unchanged.
vi.mock("@/lib/server/routing/osm", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/routing/osm")>();
  return { ...real, inNominatimQueue: vi.fn(real.inNominatimQueue) };
});
const { inNominatimQueue } = await import("@/lib/server/routing/osm");

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  vi.mocked(inNominatimQueue).mockClear();
});

const PHOTON_ANSWER = {
  features: [
    {
      geometry: { coordinates: [-9.1373973, 38.7101406] },
      properties: { street: "Rua Augusta", housenumber: "100", postcode: "1100-050", city: "Lisboa", country: "Portugal" },
    },
  ],
};
const NOMINATIM_ANSWER = [{ lat: "38.70", lon: "-9.15", address: { road: "Rua das Madres", postcode: "1200-863", city: "Lisboa", country: "Portugal" } }];

const service = () =>
  vi.fn(async (url: unknown) => ({ ok: true, status: 200, json: async () => (String(url).includes("nominatim") ? NOMINATIM_ANSWER : PHOTON_ANSWER) }) as Response);

const ask = (q: string, fetchImpl: typeof fetch, mode?: string) =>
  searchPlaces(
    new Request(`http://localhost:3000/api/places?q=${encodeURIComponent(q)}${mode ? `&mode=${mode}` : ""}`, {
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
    }),
    app.deps,
    fetchImpl,
  );

describe("search_places: at most 30 searches per user per minute", () => {
  it("refuses the 31st search within a minute (429) without asking the service", async () => {
    await app.reset();
    await app.signedInAs("limit-a@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service();
    for (let i = 1; i <= 30; i++) {
      expect((await ask("Rua Augusta", fetchImpl as unknown as typeof fetch)).status, `search ${i}`).toBe(200);
      app.advance(1000);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(30);
    expect(await read(await ask("Rua Augusta", fetchImpl as unknown as typeof fetch))).toEqual({
      status: 429,
      body: { error: "too_many_searches", message: "Too many searches. Try again in a minute." },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(30);
  });

  it("does not count searches too short to ask the service", async () => {
    await app.reset();
    await app.signedInAs("limit-b@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service();
    for (let i = 0; i < 40; i++) await ask("ru", fetchImpl as unknown as typeof fetch);
    expect((await ask("Rua Augusta", fetchImpl as unknown as typeof fetch)).status).toBe(200);
  });

  it("does not affect another user", async () => {
    await app.reset();
    await app.signedInAs("limit-c@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service();
    for (let i = 0; i < 30; i++) await ask("Rua Augusta", fetchImpl as unknown as typeof fetch);
    expect((await ask("Rua Augusta", fetchImpl as unknown as typeof fetch)).status).toBe(429);

    await app.signedInAs("limit-d@example.com", { timeZone: "Europe/Lisbon" });
    expect((await ask("Rua Augusta", fetchImpl as unknown as typeof fetch)).status).toBe(200);
  });

  it("works again a minute after the oldest search", async () => {
    await app.reset();
    await app.signedInAs("limit-e@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service();
    for (let i = 0; i < 30; i++) await ask("Rua Augusta", fetchImpl as unknown as typeof fetch);
    app.advance(59_999);
    expect((await ask("Rua Augusta", fetchImpl as unknown as typeof fetch)).status).toBe(429);
    app.advance(1);
    expect((await ask("Rua Augusta", fetchImpl as unknown as typeof fetch)).status).toBe(200);
  });

  it("frees one search at a time as the oldest ones leave the minute", async () => {
    await app.reset();
    await app.signedInAs("limit-f@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service();
    for (let i = 0; i < 30; i++) {
      await ask("Rua Augusta", fetchImpl as unknown as typeof fetch);
      app.advance(1000);
    }
    // 30 seconds after the first search: the first has just left the minute, the other 29 have not.
    app.advance(30_000);
    expect((await ask("Rua Augusta", fetchImpl as unknown as typeof fetch)).status).toBe(200);
    expect((await ask("Rua Augusta", fetchImpl as unknown as typeof fetch)).status).toBe(429);
  });
});

describe("search_places: Confirm waits its turn for Nominatim", () => {
  it("asks Nominatim through the shared queue; plain suggestions do not use it", async () => {
    await app.reset();
    await app.signedInAs("queue-a@example.com", { timeZone: "Europe/Lisbon" });
    const fetchImpl = service();
    expect((await ask("rua das madres 66", fetchImpl as unknown as typeof fetch, "confirm")).status).toBe(200);
    expect(inNominatimQueue).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0][0])).toContain("nominatim.openstreetmap.org");

    await ask("Rua Augusta", fetchImpl as unknown as typeof fetch);
    expect(inNominatimQueue).toHaveBeenCalledOnce();
  });

  it("falls back to Photon when Nominatim fails or refuses; 502 only when Photon fails too", async () => {
    await app.reset();
    await app.signedInAs("queue-c@example.com", { timeZone: "Europe/Lisbon" });
    const nominatimDown = vi.fn(async (url: unknown) =>
      String(url).includes("nominatim")
        ? ({ ok: false, status: 429, json: async () => ({}) } as Response)
        : ({ ok: true, status: 200, json: async () => PHOTON_ANSWER } as Response),
    );
    expect(await read(await ask("Rua Augusta 100", nominatimDown as unknown as typeof fetch, "confirm"))).toEqual({
      status: 200,
      body: { places: [{ label: "Rua Augusta 100, 1100-050 Lisboa, Portugal", lat: 38.7101406, lon: -9.1373973 }] },
    });
    expect(nominatimDown).toHaveBeenCalledTimes(2);

    const nominatimThrows = vi.fn(async (url: unknown) => {
      if (String(url).includes("nominatim")) throw new Error("offline");
      return { ok: true, status: 200, json: async () => PHOTON_ANSWER } as Response;
    });
    expect((await ask("Rua Augusta 100", nominatimThrows as unknown as typeof fetch, "confirm")).status).toBe(200);

    const bothDown = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await read(await ask("Rua Augusta 100", bothDown as unknown as typeof fetch, "confirm"))).toEqual({
      status: 502,
      body: { error: "places_unavailable", message: "Address search is not available right now" },
    });
    expect(bothDown).toHaveBeenCalledTimes(2);
  });

  it("a second Confirm does not reach Nominatim while the first is still being answered", async () => {
    await app.reset();
    await app.signedInAs("queue-b@example.com", { timeZone: "Europe/Lisbon" });
    let answerFirst: () => void = () => {};
    const asked: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      asked.push(String(url));
      if (asked.length === 1) await new Promise<void>((resolve) => (answerFirst = resolve));
      return { ok: true, status: 200, json: async () => NOMINATIM_ANSWER } as Response;
    });
    const first = ask("rua das madres 66", fetchImpl as unknown as typeof fetch, "confirm");
    const second = ask("rua das madres 68", fetchImpl as unknown as typeof fetch, "confirm");
    await vi.waitFor(() => expect(asked).toHaveLength(1), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(asked).toHaveLength(1);

    answerFirst();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(asked).toHaveLength(2);
    expect(asked[1]).toContain("madres+68");
  });
});
