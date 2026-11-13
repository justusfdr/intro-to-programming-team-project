// Spec 24, one more rule found when the owner tried it: only an event that has not ended can invite
// guests, because Outlook gets no past events (R26) and no invitation would ever go out. With the fake
// Outlook and the temporary database; accepted and rejected cases; a refusal changes nothing (R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { createEvent } from "./create-event";
import { editEvent } from "./edit-event";
import { finishOutlookSignIn, startOutlookSignIn } from "./outlook-connect";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // Monday 16 November 2026, 09:00 UTC (09:00 in Lisbon)
});

const create = async (body: unknown) => read(await createEvent(postJson("/api/events", body), app.deps));
const edit = async (id: string, body: unknown) => read(await editEvent(postJson(`/api/events/${id}/edit`, body), app.deps, id));

const ENDED = { status: 400, body: { error: "guests_ended", message: "Guests can only be invited to events that have not ended" } };

const guestsOf = async (id: string) =>
  (await app.db.admin<{ guests: string[] | null }>("select guests from app.events where id = $1", [id]))[0]?.guests;
const eventCount = async () => (await app.db.admin<{ n: number }>("select count(*)::int as n from app.events"))[0].n;

/** Signs in and connects Outlook (the fake). */
async function connected() {
  const user = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
  const code = app.outlook.account([]);
  const started = await startOutlookSignIn(postJson("/api/outlook/connect", {}), app.deps, app.outlookDeps);
  const state = new URL(started.headers.get("location")!).searchParams.get("state")!;
  const cookie = /^outlook_sign_in=([^;]*)/.exec(started.headers.get("set-cookie") ?? "")?.[1] ?? "";
  const callback = new Request(`${OWN_ORIGIN}/api/outlook/callback?${new URLSearchParams({ code, state })}`, {
    headers: { host: "localhost:3000", "sec-fetch-site": "cross-site", cookie: `outlook_sign_in=${cookie}` },
  });
  await finishOutlookSignIn(callback, app.deps, app.outlookDeps);
  return user;
}

describe("guests only on an event that has not ended", () => {
  it("create_event: an event later today takes guests; one that ended this morning or last week is refused and not saved", async () => {
    await connected();
    const later = await create({ title: "Lunch", start: "2026-11-16T12:00", end: "2026-11-16T13:00", guests: ["lea@example.com"] });
    expect(later.status).toBe(201);

    const before = await eventCount();
    expect(await create({ title: "Breakfast", start: "2026-11-16T07:00", end: "2026-11-16T08:00", guests: ["lea@example.com"] })).toEqual(ENDED);
    expect(await create({ title: "Old", start: "2026-11-11T18:00", end: "2026-11-11T19:00", guests: ["lea@example.com"] })).toEqual(ENDED);
    expect(await eventCount()).toBe(before);
    // Without guests a past event is still fine.
    expect((await create({ title: "Old", start: "2026-11-11T18:00", end: "2026-11-11T19:00" })).status).toBe(201);
  });

  it("create_event: an all-day event that ends today takes guests; one that ended yesterday does not", async () => {
    await connected();
    expect((await create({ title: "Fair", allDay: true, firstDay: "2026-11-15", lastDay: "2026-11-16", guests: ["lea@example.com"] })).status).toBe(201);
    expect(await create({ title: "Trip", allDay: true, firstDay: "2026-11-14", lastDay: "2026-11-15", guests: ["lea@example.com"] })).toEqual(ENDED);
  });

  it("edit_event: adding a guest to a past event is refused and nothing changes; moving it into the future with the guest works", async () => {
    const userId = await connected();
    const past = await seedEvent(app.db, userId, { title: "Old", start: "2026-11-11T18:00:00Z", end: "2026-11-11T19:00:00Z" });
    const fields = { title: "Old", start: "2026-11-11T18:00", end: "2026-11-11T19:00", updatedAt: past.updatedAt };
    expect(await edit(past.id, { ...fields, guests: ["lea@example.com"] })).toEqual(ENDED);
    expect(await guestsOf(past.id)).toBeNull();

    const moved = await edit(past.id, { ...fields, start: "2026-11-17T18:00", end: "2026-11-17T19:00", guests: ["lea@example.com"] });
    expect(moved.status).toBe(200);
    expect(await guestsOf(past.id)).toEqual(["lea@example.com"]);
  });

  it("edit_event: taking a guest off an event that has ended since stays possible", async () => {
    const userId = await connected();
    const event = await seedEvent(app.db, userId, { title: "Call", start: "2026-11-16T10:00:00Z", end: "2026-11-16T11:00:00Z" });
    const fields = { title: "Call", start: "2026-11-16T10:00", end: "2026-11-16T11:00" };
    const invited = await edit(event.id, { ...fields, updatedAt: event.updatedAt, guests: ["lea@example.com", "tom@example.com"] });
    expect(invited.status).toBe(200);

    app.advance(3 * 60 * 60 * 1000); // 12:00: the call is over
    const updatedAt = (invited.body.event as { updatedAt: string }).updatedAt;
    const fewer = await edit(event.id, { ...fields, updatedAt, guests: ["lea@example.com"] });
    expect(fewer.status).toBe(200);
    expect(await guestsOf(event.id)).toEqual(["lea@example.com"]);
    // Somebody new is refused now.
    const again = (fewer.body.event as { updatedAt: string }).updatedAt;
    expect(await edit(event.id, { ...fields, updatedAt: again, guests: ["lea@example.com", "mia@example.com"] })).toEqual(ENDED);
  });
});
