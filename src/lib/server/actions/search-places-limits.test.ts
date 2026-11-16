// Tests for the limits of search_places: at most 30 searches per user per minute. Google is replaced by a
// stand-in, so the tests need neither the internet nor a real key.
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

const ANSWER = { suggestions: [{ placePrediction: { placeId: "x", text: { text: "Rua Augusta 100, Lisbon, Portugal" } } }] };

const service = () => vi.fn(async () => ({ ok: true, status: 200, json: async () => ANSWER }) as Response);

const ask = (q: string, fetchImpl: typeof fetch) =>
  searchPlaces(
    new Request(`http://localhost:3000/api/places?q=${encodeURIComponent(q)}`, {
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
