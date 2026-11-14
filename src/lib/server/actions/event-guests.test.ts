// Tests for spec 24 on the server, with the fake Outlook and the temporary database: create_event and
// edit_event take guests (only while Outlook is connected, never for a series, a demo event or an
// Outlook event), R4 holds, guests go to Outlook as required attendees (and events that never had any
// go exactly as before), the import shows an Outlook event's attendees and organizer read-only (R11),
// deleting tells Outlook, and the coach may not move or delete an event with guests (R22).
// Every rule with an accepted and a rejected case; a refusal changes nothing (R1).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { setPlan } from "@test/support/chat";
import { seedEvent } from "@test/support/events";
import { isChangeable } from "@/lib/chat/checks";
import { SYSTEM_PROMPT } from "@/lib/chat/prompt";
import { loadWeek } from "@/lib/server/events/week";
import { batchBody, graphBody, mapGraphEvent } from "@/lib/server/outlook/graph";
import type { OutlookEvent } from "@/lib/server/outlook/types";
import { createEvent } from "./create-event";
import { deleteEvent } from "./delete-event";
import { editEvent } from "./edit-event";
import { sendOutlookNow, syncOutlookNow } from "./outlook";
import { finishOutlookSignIn, startOutlookSignIn } from "./outlook-connect";
import { sendMessage } from "./send-message";

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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const create = async (body: unknown) => read(await createEvent(postJson("/api/events", body), app.deps));
const edit = async (id: string, body: unknown) => read(await editEvent(postJson(`/api/events/${id}/edit`, body), app.deps, id));
const remove = async (id: string, body: unknown) => read(await deleteEvent(postJson(`/api/events/${id}/delete`, body), app.deps, id));
const sendNow = async () => read(await sendOutlookNow(postJson("/api/outlook/send", {}), app.deps, app.outlookDeps));
const syncNow = async () => read(await syncOutlookNow(postJson("/api/outlook/sync", {}), app.deps, app.outlookDeps));

const STUDY = { title: "Study group", start: "2026-11-17T14:00", end: "2026-11-17T16:00" };

const NEED_OUTLOOK = { status: 409, body: { error: "guests_need_outlook", message: "Connect Outlook to invite guests" } };
const NOT_IN_SERIES = { status: 400, body: { error: "guests_series", message: "Events of a series cannot have guests" } };
const IN_OUTLOOK = { status: 409, body: { error: "outlook_event", message: "Change this event in Outlook" } };
const NOT_FOUND = { status: 404, body: { error: "not_found", message: "Not found" } };

const guestsOf = async (id: string) =>
  (await app.db.admin<{ guests: string[] | null }>("select guests from app.events where id = $1", [id]))[0]?.guests;

/** Signs in and connects Outlook with these events (no sync yet); returns the user and the account's code. */
async function connected(events: OutlookEvent[] = [], email = "alice@example.com") {
  const user = await app.signedInAs(email, { timeZone: "Europe/Lisbon" });
  const code = app.outlook.account(events);
  const started = await startOutlookSignIn(postJson("/api/outlook/connect", {}), app.deps, app.outlookDeps);
  const state = new URL(started.headers.get("location")!).searchParams.get("state")!;
  const cookie = /^outlook_sign_in=([^;]*)/.exec(started.headers.get("set-cookie") ?? "")?.[1] ?? "";
  const callback = new Request(`${OWN_ORIGIN}/api/outlook/callback?${new URLSearchParams({ code, state })}`, {
    headers: { host: "localhost:3000", "sec-fetch-site": "cross-site", cookie: `outlook_sign_in=${cookie}` },
  });
  await finishOutlookSignIn(callback, app.deps, app.outlookDeps);
  return { user, code };
}

/** What the fake Outlook got for one of our events (by our id), last first. */
const sentFor = (id: string) => app.outlook.sentOps.filter((op) => op.ref === id).reverse();

describe("create_event with guests", () => {
  it("saves them lower-case, trimmed and each once, answers with them, and Outlook gets them as required attendees", async () => {
    const { user, code } = await connected();
    const answer = await create({ ...STUDY, guests: [" Lea@Example.com ", "tom@uni.example.org", "lea@example.com"] });
    expect(answer.status).toBe(201);
    const event = answer.body.event as { id: string; guests: string[] };
    expect(event.guests).toEqual(["lea@example.com", "tom@uni.example.org"]);
    expect(await app.db.admin("select guests from app.events where user_id = $1", [user])).toEqual([{ guests: ["lea@example.com", "tom@uni.example.org"] }]);

    expect((await sendNow()).body).toEqual({ sent: 1 });
    const [op] = sentFor(event.id);
    expect(op).toMatchObject({ kind: "create", event: { title: "Study group", attendees: ["lea@example.com", "tom@uni.example.org"] } });
    expect([...app.outlook.eventsOf(code).values()]).toMatchObject([{ title: "Study group", attendees: ["lea@example.com", "tom@uni.example.org"] }]);
  });

  it("also on an all-day event", async () => {
    await connected();
    const answer = await create({ title: "Trip", allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-21", guests: ["lea@example.com"] });
    expect(answer.status).toBe(201);
    expect(answer.body.event).toMatchObject({ allDay: true, guests: ["lea@example.com"] });
  });

  it("an event without guests (or an empty list) is saved without a list and sent exactly as before", async () => {
    const { user } = await connected();
    const a = (await create(STUDY)).body.event as { id: string };
    const b = (await create({ ...STUDY, title: "Run", guests: [] })).body.event as { id: string };
    expect(await app.db.admin("select guests from app.events where user_id = $1", [user])).toEqual([{ guests: null }, { guests: null }]);
    expect((await create(STUDY)).body.event).not.toHaveProperty("guests");
    await sendNow();
    for (const id of [a.id, b.id]) expect(sentFor(id)[0].kind === "create" && sentFor(id)[0]).not.toHaveProperty("event.attendees");
  });

  it("refuses guests without a connected Outlook, also when it needs reconnecting; nothing is saved (R1)", async () => {
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    let before = await app.snapshot();
    expect(await create({ ...STUDY, guests: ["lea@example.com"] })).toEqual(NEED_OUTLOOK);
    expect(await app.snapshot()).toEqual(before);

    await connected();
    await app.db.admin("update app.calendar_connections set status = 'needs_reconnect'");
    before = await app.snapshot();
    expect(await create({ ...STUDY, guests: ["lea@example.com"] })).toEqual(NEED_OUTLOOK);
    expect(await app.snapshot()).toEqual(before);
  });

  it("refuses guests for a series (one invitation per date would flood them)", async () => {
    await connected();
    const before = await app.snapshot();
    const series = { ...STUDY, repeat: { frequency: "weekly", weekdays: [2], until: "2026-12-15" } };
    expect(await create({ ...series, guests: ["lea@example.com"] })).toEqual(NOT_IN_SERIES);
    expect(await app.snapshot()).toEqual(before);
    expect((await create({ ...series, guests: [] })).status).toBe(201);
  });

  it("refuses an address that is not one, and more than 20 guests", async () => {
    await connected();
    const before = await app.snapshot();
    for (const guests of [["lea"], ["Lea <lea@example.com>"], ["lea@example.com", ""], ["x@y"]]) {
      expect(await create({ ...STUDY, guests })).toEqual({ status: 400, body: { error: "guest_invalid", message: "This is not an e-mail address" } });
    }
    const many = Array.from({ length: 21 }, (_, i) => `g${i}@example.com`);
    expect(await create({ ...STUDY, guests: many })).toEqual({ status: 400, body: { error: "too_many_guests", message: "An event can have at most 20 guests" } });
    expect(await app.snapshot()).toEqual(before);
    expect((await create({ ...STUDY, guests: many.slice(0, 20) })).status).toBe(201);
  });
});

describe("edit_event with guests", () => {
  it("adds, changes and removes guests; left out, they stay; Outlook follows (an empty list removes them there)", async () => {
    const { code } = await connected();
    let event = (await create(STUDY)).body.event as { id: string; updatedAt: string };
    await sendNow();

    let answer = await edit(event.id, { ...STUDY, guests: ["lea@example.com"], updatedAt: event.updatedAt });
    expect(answer.status).toBe(200);
    event = answer.body.event as typeof event;
    expect(answer.body.event).toMatchObject({ guests: ["lea@example.com"] });
    await sendNow();
    expect(sentFor(event.id)[0]).toMatchObject({ kind: "update", event: { attendees: ["lea@example.com"] } });
    expect([...app.outlook.eventsOf(code).values()]).toMatchObject([{ attendees: ["lea@example.com"] }]);

    // Another field only: the guests stay.
    answer = await edit(event.id, { ...STUDY, title: "Study group (room 2)", updatedAt: event.updatedAt });
    event = answer.body.event as typeof event;
    expect(await guestsOf(event.id)).toEqual(["lea@example.com"]);

    answer = await edit(event.id, { ...STUDY, guests: [], updatedAt: event.updatedAt });
    expect(answer.status).toBe(200);
    expect(answer.body.event).not.toHaveProperty("guests");
    expect(await guestsOf(event.id)).toEqual([]);
    await sendNow();
    expect(sentFor(event.id)[0]).toMatchObject({ kind: "update", event: { attendees: [] } });
    expect([...app.outlook.eventsOf(code).values()][0]).not.toHaveProperty("attendees");
  });

  it("is rejected with an older updated_at (R4), and nothing changes", async () => {
    await connected();
    const event = (await create(STUDY)).body.event as { id: string; updatedAt: string };
    const later = (await edit(event.id, { ...STUDY, title: "Renamed", updatedAt: event.updatedAt })).body.event as { updatedAt: string };
    expect(later.updatedAt).not.toBe(event.updatedAt);
    const answer = await edit(event.id, { ...STUDY, guests: ["lea@example.com"], updatedAt: event.updatedAt });
    expect(answer).toEqual({ status: 409, body: { error: "changed_elsewhere", message: "Changed on another device. Reload to see the latest version" } });
    expect(await guestsOf(event.id)).toBeNull();
  });

  it("refuses a changed list without a connected Outlook, but the same list and other fields still save", async () => {
    await connected();
    let event = (await create({ ...STUDY, guests: ["lea@example.com"] })).body.event as { id: string; updatedAt: string };
    await app.db.admin("delete from app.calendar_connections");
    const before = await app.snapshot();
    expect(await edit(event.id, { ...STUDY, guests: ["lea@example.com", "tom@example.com"], updatedAt: event.updatedAt })).toEqual(NEED_OUTLOOK);
    expect(await edit(event.id, { ...STUDY, guests: [], updatedAt: event.updatedAt })).toEqual(NEED_OUTLOOK);
    expect(await app.snapshot()).toEqual(before);

    const answer = await edit(event.id, { ...STUDY, title: "Moved", guests: ["LEA@example.com"], updatedAt: event.updatedAt });
    expect(answer.status).toBe(200);
    event = answer.body.event as typeof event;
    expect(await app.db.admin("select title, guests from app.events where id = $1", [event.id])).toEqual([{ title: "Moved", guests: ["lea@example.com"] }]);
  });

  it("refuses guests on an event of a series and on a demo event", async () => {
    const { user } = await connected();
    await create({ ...STUDY, repeat: { frequency: "daily", until: "2026-11-18" } });
    const [inSeries] = await app.db.admin<{ id: string; updated_at: Date }>("select id, updated_at from app.events where series_id is not null order by start_at");
    const demo = await seedEvent(app.db, user, { title: "Demo", start: "2026-11-18T09:00:00Z", end: "2026-11-18T10:00:00Z" });
    await app.db.admin("update app.events set demo = true where id = $1", [demo.id]);
    const [demoRow] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [demo.id]);
    const before = await app.snapshot();
    for (const scope of ["this", "this_and_following"]) {
      expect(await edit(inSeries.id, { ...STUDY, guests: ["lea@example.com"], scope, updatedAt: new Date(inSeries.updated_at).toISOString() })).toEqual(
        NOT_IN_SERIES,
      );
    }
    expect(
      await edit(demo.id, {
        title: "Demo",
        start: "2026-11-18T09:00",
        end: "2026-11-18T10:00",
        guests: ["lea@example.com"],
        updatedAt: new Date(demoRow.updated_at).toISOString(),
      }),
    ).toEqual({ status: 400, body: { error: "guests_demo", message: "Demo events cannot have guests" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("another user's event, a missing one and a malformed id are 'Not found' (R3)", async () => {
    await connected([], "bob@example.com");
    const bobs = (await create({ ...STUDY, guests: ["lea@example.com"] })).body.event as { id: string; updatedAt: string };
    await connected();
    const before = await app.snapshot();
    for (const id of [bobs.id, "00000000-0000-4000-8000-000000000000", "not-an-id"]) {
      expect(await edit(id, { ...STUDY, guests: ["eve@example.com"], updatedAt: bobs.updatedAt })).toEqual(NOT_FOUND);
    }
    expect(await app.snapshot()).toEqual(before);
    expect(await guestsOf(bobs.id)).toEqual(["lea@example.com"]);
  });
});

describe("Outlook events (R11)", () => {
  const MEETING: OutlookEvent = {
    outlookId: "AAMk-meeting",
    title: "Project meeting",
    allDay: false,
    startAt: "2026-11-17T10:00:00.000Z",
    endAt: "2026-11-17T11:00:00.000Z",
    firstDay: null,
    lastDay: null,
    location: null,
    transactionId: null,
    attendees: ["alice@example.com", "lea@example.com"],
    organizer: "prof@uni.example.org",
  };

  it("the sync brings attendees and organizer; the calendar shows them to the owner only", async () => {
    const { user } = await connected([MEETING]);
    await syncNow();
    const week = await loadWeek(app.deps, user, "2026-11-16");
    expect(week.days.flatMap((d) => d.events)).toMatchObject([
      { title: "Project meeting", source: "outlook", guests: ["alice@example.com", "lea@example.com"], organizer: "prof@uni.example.org" },
    ]);
    const bob = await app.signedInAs("bob@example.com");
    expect((await loadWeek(app.deps, bob, "2026-11-16")).days.flatMap((d) => d.events)).toEqual([]);
  });

  it("refuses guests in an edit: 'Change this event in Outlook', nothing changes", async () => {
    await connected([MEETING]);
    await syncNow();
    const [row] = await app.db.admin<{ id: string; updated_at: Date }>("select id, updated_at from app.events where source = 'outlook'");
    const before = await app.snapshot();
    for (const guests of [["eve@example.com"], []]) {
      expect(await edit(row.id, { guests, updatedAt: new Date(row.updated_at).toISOString() })).toEqual(IN_OUTLOOK);
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("Graph's attendees and organizer are read as plain addresses, without rooms, names or the organizer twice", () => {
    const raw = {
      id: "AAMk-1",
      subject: "Project meeting",
      isAllDay: false,
      showAs: "busy",
      start: { dateTime: "2026-11-17T10:00:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-11-17T11:00:00.0000000", timeZone: "UTC" },
      organizer: { emailAddress: { name: "Prof", address: "Prof@Uni.example.org" } },
      attendees: [
        { type: "required", emailAddress: { name: "Lea", address: "Lea@example.com" } },
        { type: "optional", emailAddress: { name: "Prof", address: "prof@uni.example.org" } },
        { type: "resource", emailAddress: { name: "Room 2.14", address: "room214@uni.example.org" } },
        { type: "required", emailAddress: { name: "Group", address: "/o=ExchangeLabs/ou=group" } },
        { type: "required", emailAddress: { address: "lea@example.com" } },
      ],
    };
    expect(mapGraphEvent(raw)).toMatchObject({ attendees: ["lea@example.com"], organizer: "prof@uni.example.org" });
    expect(mapGraphEvent({ ...raw, attendees: [], organizer: undefined })).not.toHaveProperty("attendees");
  });
});

describe("what Graph gets (R26)", () => {
  const event = { title: "Study group", allDay: false, startAt: "2026-11-17T14:00:00.000Z", endAt: "2026-11-17T16:00:00.000Z", firstDay: null, lastDay: null, transactionId: "e1" };

  it("guests as required attendees; an empty list; left out, no attendees field at all", () => {
    expect(graphBody({ ...event, attendees: ["lea@example.com"] }, true)).toMatchObject({
      attendees: [{ emailAddress: { address: "lea@example.com" }, type: "required" }],
    });
    expect(graphBody({ ...event, attendees: [] }, false)).toMatchObject({ attendees: [] });
    expect(graphBody(event, true)).not.toHaveProperty("attendees");
    expect(batchBody([{ kind: "update", ref: "e1", outlookId: "AAMk-1", event: { ...event, attendees: [] } }]).requests[0]).toMatchObject({
      method: "PATCH",
      body: { attendees: [] },
    });
  });
});

describe("sending and deleting", () => {
  it("Outlook down: the event is 'Not sent to Outlook' and its guests are invited at the next sync", async () => {
    const { user, code } = await connected();
    app.outlook.down = true;
    const event = (await create({ ...STUDY, guests: ["lea@example.com"] })).body.event as { id: string };
    expect((await sendNow()).body).toEqual({ sent: 0 });
    expect((await loadWeek(app.deps, user, "2026-11-16")).days.flatMap((d) => d.events)).toMatchObject([{ id: event.id, notSent: true }]);
    app.outlook.down = false;
    await syncNow();
    expect([...app.outlook.eventsOf(code).values()]).toMatchObject([{ title: "Study group", attendees: ["lea@example.com"] }]);
    expect((await loadWeek(app.deps, user, "2026-11-16")).days.flatMap((d) => d.events)).toMatchObject([{ id: event.id, notSent: false, guests: ["lea@example.com"] }]);
  });

  it("the sync does not import the user's own event with guests a second time", async () => {
    const { user } = await connected();
    await create({ ...STUDY, guests: ["lea@example.com"] });
    await syncNow();
    app.advance(6 * 60 * 1000);
    await syncNow();
    expect(await app.db.admin("select source, guests, organizer from app.events where user_id = $1", [user])).toEqual([
      { source: "app", guests: ["lea@example.com"], organizer: null },
    ]);
  });

  it("deleting an event with guests deletes it in Outlook (Outlook tells the guests)", async () => {
    const { code } = await connected();
    const event = (await create({ ...STUDY, guests: ["lea@example.com"] })).body.event as { id: string; updatedAt: string };
    await sendNow();
    expect(app.outlook.eventsOf(code).size).toBe(1);
    expect((await remove(event.id, { updatedAt: event.updatedAt })).status).toBe(200);
    await sendNow();
    expect(app.outlook.eventsOf(code).size).toBe(0);
  });
});

describe("the coach and events with guests (R22)", () => {
  it("never moves or deletes an event with guests, and never sees the addresses", async () => {
    const now = new Date("2026-11-16T09:00:00Z");
    const base = { allDay: false, source: "app", seriesId: null, startAt: new Date("2026-11-17T14:00:00Z") };
    expect(isChangeable(base, now)).toBe(true);
    expect(isChangeable({ ...base, hasGuests: false }, now)).toBe(true);
    expect(isChangeable({ ...base, hasGuests: true }, now)).toBe(false);
    expect(SYSTEM_PROMPT).toContain("events with guests");
  });

  it("flags the event as not changeable, sends no address, and an answer that moves it fails the checks", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = await connected();
    await setPlan(app.db, user, "pro");
    const event = (await create({ ...STUDY, guests: ["lea@example.com"] })).body.event as { id: string };
    await create({ ...STUDY, title: "Gym", start: "2026-11-17T18:00", end: "2026-11-17T19:00" });

    app.assistant.answerJson({
      kind: "draft",
      text: "Moved the study group.",
      events: [],
      changes: [{ ref: "e1", action: "move", start: "2026-11-17T16:00", end: "2026-11-17T18:00" }],
    });
    const answer = await read(await sendMessage(postJson("/api/chat/messages", { text: "Move the study group to 4pm" }), app.deps));
    expect(answer).toEqual({ status: 502, body: { error: "answer_failed_checks", message: "The assistant's answer failed our checks. Please try again" } });
    const data = app.assistant.lastData();
    expect(data.events).toMatchObject([
      { ref: "e1", changeable: false, title: "Study group" },
      { ref: "e2", changeable: true, title: "Gym" },
    ]);
    expect(app.assistant.requests[0].data).not.toContain("lea@example.com");
    expect(app.assistant.requests[0].data).not.toContain("guest");
    expect(await guestsOf(event.id)).toEqual(["lea@example.com"]);
  });

  it("may still add to-dos to an event with guests", async () => {
    const { user } = await connected();
    await setPlan(app.db, user, "pro");
    await create({ ...STUDY, guests: ["lea@example.com"] });
    app.assistant.answerJson({ kind: "draft", text: "Added.", events: [], changes: [], addTodos: [{ ref: "e1", todos: ["Bring the slides"] }] });
    const answer = await read(await sendMessage(postJson("/api/chat/messages", { text: "For the study group: bring the slides" }), app.deps));
    expect(answer.status).toBe(201);
    const events = app.assistant.lastData().events as Record<string, unknown>[];
    expect(events).toMatchObject([{ ref: "e1", changeable: false, title: "Study group" }]);
    expect(events[0]).not.toHaveProperty("canAddTodos");
  });
});
