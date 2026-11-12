// Tests for an event's location (spec 16): create_event and edit_event take it (up to 200 characters,
// empty means none, left out of an edit it stays); a series gets it on every event (R28); an Outlook
// event's location stays Outlook's (R11); an app event's location goes to Outlook with the event (R26).
// Each rejected case checks the exact message and that nothing changed (R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { graphBody } from "@/lib/server/outlook/graph";
import type { OutlookEvent } from "@/lib/server/outlook/types";
import { createEvent } from "./create-event";
import { editEvent } from "./edit-event";
import { sendOutlookNow, syncOutlookNow } from "./outlook";
import { finishOutlookSignIn, startOutlookSignIn } from "./outlook-connect";

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

const create = async (body: unknown) => read(await createEvent(postJson("/api/events", body), app.deps));
const edit = async (id: string, body: unknown) => read(await editEvent(postJson(`/api/events/${id}/edit`, body), app.deps, id));

const LUNCH = { title: "Lunch", start: "2026-11-17T12:30", end: "2026-11-17T13:30" };
const SEED = { title: "Lunch", start: "2026-11-17T12:30:00Z", end: "2026-11-17T13:30:00Z" };

const locations = (user: string) =>
  app.db.admin<{ location: string | null }>("select location from app.events where user_id = $1 order by start_at, first_day", [user]);
const locationOf = async (id: string) =>
  (await app.db.admin<{ location: string | null }>("select location from app.events where id = $1", [id]))[0].location;

describe("create_event with a location", () => {
  it("saves it trimmed and answers with it", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const answer = await create({ ...LUNCH, location: "  Nova SBE, Carcavelos " });
    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({ event: { title: "Lunch", location: "Nova SBE, Carcavelos" } });
    expect(await locations(alice)).toEqual([{ location: "Nova SBE, Carcavelos" }]);
  });

  it("saves none for an empty location, a null one, or none at all", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    for (const location of ["", "   ", null, undefined]) expect((await create({ ...LUNCH, location })).status).toBe(201);
    expect(await locations(alice)).toEqual([{ location: null }, { location: null }, { location: null }, { location: null }]);
  });

  it("accepts 200 characters, also on an all-day event", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    expect((await create({ ...LUNCH, location: "x".repeat(200) })).status).toBe(201);
    expect((await create({ title: "Trip", allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-21", location: "Porto" })).status).toBe(201);
    expect(await locations(alice)).toEqual([{ location: "x".repeat(200) }, { location: "Porto" }]);
  });

  it("gives every event of a series the location (R28)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const answer = await create({ ...LUNCH, location: "Cafeteria", repeat: { frequency: "daily", until: "2026-11-19" } });
    expect(answer.body).toMatchObject({ count: 3 });
    expect(await locations(alice)).toEqual([{ location: "Cafeteria" }, { location: "Cafeteria" }, { location: "Cafeteria" }]);
  });

  it("rejects 201 characters with 'Location can be at most 200 characters' and saves nothing", async () => {
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const before = await app.snapshot();
    const answer = await create({ ...LUNCH, location: "x".repeat(201) });
    expect(answer).toEqual({ status: 400, body: { error: "location_length", message: "Location can be at most 200 characters" } });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("edit_event with a location", () => {
  it("sets, changes and clears the location; left out, it stays; updated_at moves on (R4)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);

    const first = await edit(id, { ...LUNCH, location: "Library", updatedAt });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ message: "Event saved.", event: { id, location: "Library" } });
    const next = (first.body.event as { updatedAt: string }).updatedAt;
    expect(Date.parse(next)).toBeGreaterThan(Date.parse(updatedAt));

    const kept = await edit(id, { ...LUNCH, title: "Long lunch", updatedAt: next });
    expect(kept.body).toMatchObject({ event: { title: "Long lunch", location: "Library" } });

    const cleared = await edit(id, { ...LUNCH, location: "", updatedAt: (kept.body.event as { updatedAt: string }).updatedAt });
    expect(cleared.body).toMatchObject({ event: { location: null } });
    expect(await locationOf(id)).toBeNull();
  });

  it("gives this and the following events of a series the location, not the earlier ones (R28)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await create({ ...LUNCH, repeat: { frequency: "daily", until: "2026-11-19" } });
    const [, second] = await app.db.admin<{ id: string; updated_at: Date }>("select id, updated_at from app.events where user_id = $1 order by start_at", [alice]);
    const answer = await edit(second.id, {
      title: "Lunch",
      start: "2026-11-18T12:30",
      end: "2026-11-18T13:30",
      location: "Cafeteria",
      updatedAt: new Date(second.updated_at).toISOString(),
      scope: "this_and_following",
    });
    expect(answer.body).toMatchObject({ count: 2 });
    expect(await locations(alice)).toEqual([{ location: null }, { location: "Cafeteria" }, { location: "Cafeteria" }]);
  });

  it("rejects 201 characters and changes nothing (R1)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    const before = await app.snapshot();
    const answer = await edit(id, { ...LUNCH, location: "x".repeat(201), updatedAt });
    expect(answer).toEqual({ status: 400, body: { error: "location_length", message: "Location can be at most 200 characters" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a location sent with an old updated_at and changes nothing (R4)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    expect((await edit(id, { ...LUNCH, title: "Lunch 2", updatedAt })).status).toBe(200);
    const before = await app.snapshot();
    const answer = await edit(id, { ...LUNCH, location: "Library", updatedAt });
    expect(answer).toMatchObject({ status: 409, body: { message: "Changed on another device. Reload to see the latest version" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("does not find another user's event (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, bob, SEED);
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const answer = await edit(id, { ...LUNCH, location: "Hacked", updatedAt });
    expect(answer).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(await locationOf(id)).toBeNull();
  });
});

describe("an Outlook event's location (R11)", () => {
  const LECTURE: OutlookEvent = {
    outlookId: "AAMk-lecture",
    title: "Statistics lecture",
    allDay: false,
    startAt: "2026-11-17T09:00:00.000Z",
    endAt: "2026-11-17T10:30:00.000Z",
    firstDay: null,
    lastDay: null,
    location: "Nova SBE, Carcavelos",
    transactionId: null,
  };

  /** Signs in, connects Outlook with these events and syncs once; returns the user and the account's code. */
  async function connected(events: OutlookEvent[]) {
    const user = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const code = app.outlook.account(events);
    const started = await startOutlookSignIn(postJson("/api/outlook/connect", {}), app.deps, app.outlookDeps);
    const state = new URL(started.headers.get("location")!).searchParams.get("state")!;
    const cookie = /^outlook_sign_in=([^;]*)/.exec(started.headers.get("set-cookie") ?? "")?.[1] ?? "";
    const callback = new Request(`${OWN_ORIGIN}/api/outlook/callback?${new URLSearchParams({ code, state })}`, {
      headers: { host: "localhost:3000", "sec-fetch-site": "cross-site", cookie: `outlook_sign_in=${cookie}` },
    });
    await finishOutlookSignIn(callback, app.deps, app.outlookDeps);
    await syncOutlookNow(postJson("/api/outlook/sync", {}), app.deps, app.outlookDeps);
    return { user, code };
  }

  it("cannot be changed or cleared: 'Change this event in Outlook', nothing changes", async () => {
    await connected([LECTURE]);
    const [row] = await app.db.admin<{ id: string; updated_at: Date }>("select id, updated_at from app.events where source = 'outlook'");
    const before = await app.snapshot();
    for (const location of ["Elsewhere", "", null]) {
      const answer = await edit(row.id, { location, updatedAt: new Date(row.updated_at).toISOString() });
      expect(answer).toEqual({ status: 409, body: { error: "outlook_event", message: "Change this event in Outlook" } });
    }
    expect(await app.snapshot()).toEqual(before);
    expect(await locationOf(row.id)).toBe("Nova SBE, Carcavelos");
  });

  it("an app event's location goes to Outlook with the event, and a change of it too (R26)", async () => {
    const { user, code } = await connected([]);
    const created = await create({ ...LUNCH, location: "Cafeteria" });
    expect((await read(await sendOutlookNow(postJson("/api/outlook/send", {}), app.deps, app.outlookDeps))).body).toEqual({ sent: 1 });
    expect([...app.outlook.eventsOf(code).values()]).toMatchObject([{ title: "Lunch", location: "Cafeteria" }]);

    const event = created.body.event as { id: string; updatedAt: string };
    expect((await edit(event.id, { ...LUNCH, location: "Library", updatedAt: event.updatedAt })).status).toBe(200);
    await sendOutlookNow(postJson("/api/outlook/send", {}), app.deps, app.outlookDeps);
    expect([...app.outlook.eventsOf(code).values()]).toMatchObject([{ title: "Lunch", location: "Library" }]);
    expect(await locations(user)).toEqual([{ location: "Library" }]);
  });

  it("Graph gets the location as its display name; none clears it; left out, Outlook's stays", () => {
    const event = { title: "Lunch", allDay: false, startAt: "2026-11-17T12:30:00.000Z", endAt: "2026-11-17T13:30:00.000Z", firstDay: null, lastDay: null, transactionId: "e1" };
    expect(graphBody({ ...event, location: "Cafeteria" }, true)).toMatchObject({ location: { displayName: "Cafeteria" } });
    expect(graphBody({ ...event, location: null }, false)).toMatchObject({ location: { displayName: "" } });
    expect(graphBody(event, false)).not.toHaveProperty("location");
  });
});
