// Tests for an event's notes (issue #5, spec 27) on the server, with the temporary database, the fake
// Outlook and the fake assistant: create_event and edit_event take them (up to 2,000 characters, counted
// as characters; whitespace at the end trimmed; empty means none; left out of an edit they stay); a
// series gets them on every event, "this and following" on the later ones (R28); the calendar shows them
// again after a reload; an Outlook event takes none (R11); notes never go to Outlook (R26) or to Claude
// (R22). Every rule with an accepted and a rejected case; a refusal changes nothing (R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { setPlan } from "@test/support/chat";
import { seedEvent } from "@test/support/events";
import { loadWeek } from "@/lib/server/events/week";
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
  await app.reset(); // Monday 16 November 2026, 09:00 UTC
});

const create = async (body: unknown) => read(await createEvent(postJson("/api/events", body), app.deps));
const edit = async (id: string, body: unknown) => read(await editEvent(postJson(`/api/events/${id}/edit`, body), app.deps, id));
const remove = async (id: string, body: unknown) => read(await deleteEvent(postJson(`/api/events/${id}/delete`, body), app.deps, id));
const sendNow = async () => read(await sendOutlookNow(postJson("/api/outlook/send", {}), app.deps, app.outlookDeps));

const LUNCH = { title: "Lunch", start: "2026-11-17T12:30", end: "2026-11-17T13:30" };
const SEED = { title: "Lunch", start: "2026-11-17T12:30:00Z", end: "2026-11-17T13:30:00Z" };
const NOTE = "Ask Ana about the exam.\nBring the slides.";

const TOO_LONG = { status: 400, body: { error: "notes_length", message: "Notes can be at most 2,000 characters" } };
const IN_OUTLOOK = { status: 409, body: { error: "outlook_event", message: "Change this event in Outlook" } };
const NOT_FOUND = { status: 404, body: { error: "not_found", message: "Not found" } };

const notesOf = async (id: string) => (await app.db.admin<{ notes: string | null }>("select notes from app.events where id = $1", [id]))[0]?.notes;
const allNotes = (user: string) =>
  app.db.admin<{ notes: string | null }>("select notes from app.events where user_id = $1 order by start_at, first_day", [user]);
const shown = async (user: string) => (await loadWeek(app.deps, user, "2026-11-16")).days.flatMap((d) => [...d.events, ...d.allDay]);

/** Signs in and connects Outlook with these events, then syncs once. */
async function connected(events: OutlookEvent[] = []) {
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

describe("create_event with notes", () => {
  it("saves them with whitespace at the end trimmed (not at the start), answers with them, and shows them again after a reload", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const answer = await create({ ...LUNCH, notes: `  ${NOTE}  \n\n` });
    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({ event: { title: "Lunch", notes: `  ${NOTE}` } });
    expect(await allNotes(alice)).toEqual([{ notes: `  ${NOTE}` }]);
    // A reload: the calendar reads the event again with its notes.
    expect(await shown(alice)).toMatchObject([{ title: "Lunch", notes: `  ${NOTE}` }]);
  });

  it("saves none for empty notes, only spaces, null or none at all; the event then has no notes field", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    for (const notes of ["", "  \n ", null, undefined]) {
      const answer = await create({ ...LUNCH, notes });
      expect(answer.status).toBe(201);
      expect(answer.body.event).not.toHaveProperty("notes");
    }
    expect(await allNotes(alice)).toEqual(Array(4).fill({ notes: null }));
  });

  it("accepts 2,000 characters (also 2,000 emoji, counted as characters) and an all-day event's notes", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    expect((await create({ ...LUNCH, notes: "x".repeat(2000) })).status).toBe(201);
    expect((await create({ ...LUNCH, notes: "😀".repeat(2000) })).status).toBe(201);
    expect((await create({ title: "Trip", allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-21", notes: "Pack light" })).status).toBe(201);
    expect(await allNotes(alice)).toEqual([{ notes: "x".repeat(2000) }, { notes: "😀".repeat(2000) }, { notes: "Pack light" }]);
  });

  it("rejects 2,001 characters with the message and saves nothing (R1)", async () => {
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const before = await app.snapshot();
    for (const notes of ["x".repeat(2001), "😀".repeat(2001), `${"x".repeat(2001)}   `.trimStart()]) expect(await create({ ...LUNCH, notes })).toEqual(TOO_LONG);
    expect(await create({ title: "Trip", allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-21", notes: "x".repeat(2001) })).toEqual(TOO_LONG);
    expect(await app.snapshot()).toEqual(before);
  });

  it("gives every event of a new series the same notes (R28)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const answer = await create({ ...LUNCH, notes: NOTE, repeat: { frequency: "daily", until: "2026-11-19" } });
    expect(answer.body).toMatchObject({ count: 3, event: { notes: NOTE } });
    expect(await allNotes(alice)).toEqual(Array(3).fill({ notes: NOTE }));
  });
});

describe("edit_event with notes", () => {
  it("sets, keeps when left out, and clears them (null or empty)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    const set = await edit(id, { ...LUNCH, notes: NOTE, updatedAt });
    expect(set.body).toMatchObject({ event: { notes: NOTE } });
    expect(await notesOf(id)).toBe(NOTE);

    let version = (set.body.event as { updatedAt: string }).updatedAt;
    const kept = await edit(id, { ...LUNCH, title: "Long lunch", updatedAt: version });
    expect(kept.body).toMatchObject({ event: { title: "Long lunch", notes: NOTE } });
    // A move by dragging sends only the title and the times: the notes stay.
    version = (kept.body.event as { updatedAt: string }).updatedAt;
    const moved = await edit(id, { title: "Long lunch", start: "2026-11-17T13:00", end: "2026-11-17T14:00", updatedAt: version });
    expect(moved.body).toMatchObject({ event: { notes: NOTE } });

    for (const notes of [null, ""]) {
      await app.db.admin("update app.events set notes = 'Again' where id = $1", [id]);
      const [row] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [id]);
      const cleared = await edit(id, { ...LUNCH, notes, updatedAt: new Date(row.updated_at).toISOString() });
      expect(cleared.status).toBe(200);
      expect(cleared.body.event).not.toHaveProperty("notes");
      expect(await notesOf(id)).toBeNull();
    }
  });

  it("also on an all-day event, and when a timed event becomes all-day", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    const answer = await edit(id, { title: "Lunch", allDay: true, firstDay: "2026-11-17", lastDay: "2026-11-17", notes: "All day now", updatedAt });
    expect(answer.body).toMatchObject({ event: { allDay: true, notes: "All day now" } });
  });

  it("rejects 2,001 characters and changes nothing (R1)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id } = await seedEvent(app.db, alice, SEED);
    await app.db.admin("update app.events set notes = 'Before' where id = $1", [id]);
    const [row] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [id]);
    const before = await app.snapshot();
    expect(await edit(id, { ...LUNCH, title: "Renamed", notes: "x".repeat(2001), updatedAt: new Date(row.updated_at).toISOString() })).toEqual(TOO_LONG);
    expect(await app.snapshot()).toEqual(before);
    expect(await notesOf(id)).toBe("Before");
  });

  it("rejects notes sent with an old updated_at and changes nothing (R4)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    expect((await edit(id, { ...LUNCH, notes: "First device", updatedAt })).status).toBe(200);
    const before = await app.snapshot();
    const answer = await edit(id, { ...LUNCH, notes: "Second device", updatedAt });
    expect(answer).toMatchObject({ status: 409, body: { message: "Changed on another device. Reload to see the latest version" } });
    expect(await app.snapshot()).toEqual(before);
    expect(await notesOf(id)).toBe("First device");
  });

  it("gives this and the following events of a series the notes, not the earlier ones (R28)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await create({ ...LUNCH, notes: "Old", repeat: { frequency: "daily", until: "2026-11-19" } });
    const [, second] = await app.db.admin<{ id: string; updated_at: Date }>("select id, updated_at from app.events where user_id = $1 order by start_at", [alice]);
    const base = { title: "Lunch", start: "2026-11-18T12:30", end: "2026-11-18T13:30", updatedAt: new Date(second.updated_at).toISOString() };
    const answer = await edit(second.id, { ...base, notes: "New", scope: "this_and_following" });
    expect(answer.body).toMatchObject({ count: 2, event: { notes: "New" } });
    expect(await allNotes(alice)).toEqual([{ notes: "Old" }, { notes: "New" }, { notes: "New" }]);
  });

  it("another user's event, a missing one and a malformed id are 'Not found' (R3); nothing changes", async () => {
    const bob = await app.signedInAs("bob@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, bob, SEED);
    await app.db.admin("update app.events set notes = 'Bob only' where id = $1", [id]);
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const before = await app.snapshot();
    for (const target of [id, "00000000-0000-4000-8000-000000000000", "not-an-id"]) {
      expect(await edit(target, { ...LUNCH, notes: "Hacked", updatedAt })).toEqual(NOT_FOUND);
    }
    expect(await app.snapshot()).toEqual(before);
    expect(await notesOf(id)).toBe("Bob only");
  });
});

describe("notes stay in the app", () => {
  const LECTURE: OutlookEvent = {
    outlookId: "AAMk-lecture",
    title: "Statistics lecture",
    allDay: false,
    startAt: "2026-11-17T09:00:00.000Z",
    endAt: "2026-11-17T10:30:00.000Z",
    firstDay: null,
    lastDay: null,
    location: null,
    transactionId: null,
  };

  it("an Outlook event takes no notes: 'Change this event in Outlook', nothing changes (R11)", async () => {
    await connected([LECTURE]);
    const [row] = await app.db.admin<{ id: string; updated_at: Date }>("select id, updated_at from app.events where source = 'outlook'");
    const before = await app.snapshot();
    for (const notes of ["Mine", "", null]) {
      expect(await edit(row.id, { notes, updatedAt: new Date(row.updated_at).toISOString() })).toEqual(IN_OUTLOOK);
      expect(await edit(row.id, { goalId: null, notes, updatedAt: new Date(row.updated_at).toISOString() })).toEqual(IN_OUTLOOK);
    }
    expect(await app.snapshot()).toEqual(before);
    expect(await notesOf(row.id)).toBeNull();
  });

  it("are never sent to Outlook (R26): not with a new event, not with a change of the notes alone", async () => {
    const { code } = await connected();
    const created = (await create({ ...LUNCH, notes: NOTE })).body.event as { id: string; updatedAt: string };
    expect((await sendNow()).body).toEqual({ sent: 1 });
    const sentOps = () => app.outlook.sentOps.filter((op) => op.ref === created.id);
    expect(sentOps()).toMatchObject([{ kind: "create", event: { title: "Lunch" } }]);
    expect(JSON.stringify(sentOps())).not.toContain("Ask Ana");
    expect(JSON.stringify([...app.outlook.eventsOf(code).values()])).not.toContain("Ask Ana");

    // The sync does not tell a change of the notes from other changes: the event is sent again, still
    // without its notes (title, times and location as before).
    const edited = await edit(created.id, { ...LUNCH, notes: "Only the notes changed", updatedAt: created.updatedAt });
    expect(edited.status).toBe(200);
    await sendNow();
    expect(sentOps()).toHaveLength(2);
    expect(sentOps()[1]).toMatchObject({ kind: "update", event: { title: "Lunch" } });
    expect(JSON.stringify(sentOps())).not.toMatch(/Only the notes|Ask Ana|"notes"/);
  });

  it("are never sent to Claude (R22)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await setPlan(app.db, alice, "pro");
    await create({ ...LUNCH, notes: "Secret: ask Ana about the exam" });
    app.assistant.answerJson({ kind: "text", text: "Okay.", events: [], changes: [], addTodos: [] });
    const answer = await read(await sendMessage(postJson("/api/chat/messages", { text: "What is on tomorrow?" }), app.deps));
    expect(answer.status).toBe(201);
    expect(app.assistant.lastData().events).toMatchObject([{ title: "Lunch" }]);
    expect(app.assistant.requests[0].data).not.toContain("Secret");
    expect(app.assistant.requests[0].data).not.toContain("notes");
  });

  it("the delete's answer lets the calendar's Undo bring the event back with its notes (create_event with them)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const created = (await create({ ...LUNCH, notes: NOTE })).body.event as { id: string; updatedAt: string };
    expect((await remove(created.id, { updatedAt: created.updatedAt })).status).toBe(200);
    expect(await allNotes(alice)).toEqual([]);
    // What recreateBody sends for it (tested in src/components/calendar/editor/notes.test.ts).
    expect((await create({ ...LUNCH, mayOverlap: false, goalId: null, notes: NOTE })).body).toMatchObject({ event: { notes: NOTE } });
    expect(await allNotes(alice)).toEqual([{ notes: NOTE }]);
  });
});
