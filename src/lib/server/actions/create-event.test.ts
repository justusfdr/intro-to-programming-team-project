// Tests for create_event (spec 02, What lines 1 and 2). Reference pattern for actions of a signed-in user:
// the accepted case checks every saved field; each rejected case checks the exact message and that
// nothing changed, with app.snapshot() before and after.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { eventsOf } from "@test/support/events";
import { createEvent } from "./create-event";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
});

function send(body: unknown, headers?: Record<string, string>) {
  return createEvent(postJson("/api/events", body, headers), app.deps);
}

const REVISION = { title: "Statistics revision", start: "2026-11-16T09:00", end: "2026-11-16T11:00" };

describe("create_event accepted", () => {
  it("saves 'Statistics revision' 09:00 to 11:00 as planned, source app, may_overlap false", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });

    const answer = await read(await send(REVISION));

    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({
      message: "Event saved.",
      event: {
        title: "Statistics revision",
        startAt: "2026-11-16T09:00:00.000Z",
        endAt: "2026-11-16T11:00:00.000Z",
        mayOverlap: false,
        status: "planned",
      },
    });
    const [saved] = await eventsOf(app.db, alice);
    expect(saved).toMatchObject({ title: "Statistics revision", status: "planned", source: "app", may_overlap: false });
    expect(new Date(saved.start_at as Date).toISOString()).toBe("2026-11-16T09:00:00.000Z");
  });

  it("reads the times in the user's time zone and stores them in UTC", async () => {
    const ny = await app.signedInAs("nora@example.com", { timeZone: "America/New_York" });
    await send(REVISION);
    const [saved] = await eventsOf(app.db, ny);
    expect(new Date(saved.start_at as Date).toISOString()).toBe("2026-11-16T14:00:00.000Z");
  });

  it("trims the title, accepts 100 characters and exactly 24 hours, and saves may_overlap", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const answer = await read(
      await send({ title: `  ${"x".repeat(100)}  `, start: "2026-11-16T09:00", end: "2026-11-17T09:00", mayOverlap: true }),
    );
    expect(answer.status).toBe(201);
    expect(await eventsOf(app.db, alice)).toMatchObject([{ title: "x".repeat(100), may_overlap: true }]);
  });

  it("saves an event that overlaps another one (R10: overlap never rejects)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await send(REVISION);
    expect((await send({ ...REVISION, title: "Call" })).status).toBe(201);
    expect(await eventsOf(app.db, alice)).toHaveLength(2);
  });

  it("saves the event for the signed-in user only; another user's week stays empty", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com");
    await send(REVISION);
    expect(await eventsOf(app.db, alice)).toHaveLength(1);
    expect(await eventsOf(app.db, bob)).toEqual([]);
  });
});

describe("create_event rejected: nothing is saved (R1, A10)", () => {
  it.each([
    ["an empty title", { ...REVISION, title: "" }, 400, "title_length", "Title must be 1 to 100 characters"],
    ["a title of only spaces", { ...REVISION, title: "   " }, 400, "title_length", "Title must be 1 to 100 characters"],
    ["a 101-character title", { ...REVISION, title: "x".repeat(101) }, 400, "title_length", "Title must be 1 to 100 characters"],
    ["14:00 to 13:00", { ...REVISION, start: "2026-11-16T14:00", end: "2026-11-16T13:00" }, 400, "end_before_start", "End must be after start"],
    ["an end equal to the start", { ...REVISION, end: REVISION.start }, 400, "end_before_start", "End must be after start"],
    ["25 hours", { ...REVISION, end: "2026-11-17T10:00" }, 400, "too_long", "An event can last at most 24 hours"],
  ])("rejects %s", async (_case, body, status, error, message) => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    const answer = await read(await send(body));

    expect(answer).toEqual({ status, body: { error, message } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects times that are not datetime-local values, and a body of the wrong shape", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    for (const body of [
      { ...REVISION, start: "16/11/2026 09:00" },
      { ...REVISION, end: "2026-02-30T10:00" },
      { title: "x" },
      { ...REVISION, mayOverlap: "yes" },
      "{not json",
    ]) {
      expect((await send(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 401 without a session and saves nothing (R3)", async () => {
    const before = await app.snapshot();
    const answer = await read(await send(REVISION));
    expect(answer).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a request from another site (403) and saves nothing", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    const response = await send(REVISION, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
  });
});
