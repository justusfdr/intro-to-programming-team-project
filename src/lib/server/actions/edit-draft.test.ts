// Tests for edit_draft (spec 22; ontology section 5, R1, R3, R4, R23) with the temporary database:
// dragging a new event or a moved event of the open draft to new times on the same day. Every rule
// with an accepted and a refused case; a refusal changes nothing. Also: accepting applies the draft as
// the person left it, and the history sent to Claude marks it "adjusted by the person".
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { A5_PROPOSALS, seedDraft, type SeedChange } from "@test/support/chat";
import { eventsOf, seedEvent } from "@test/support/events";
import { acceptDraft } from "./accept-draft";
import { editDraft } from "./edit-draft";
import { sendMessage } from "./send-message";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // Monday 16 November 2026, 09:00 UTC (09:00 in Lisbon, UTC+0 in November)
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The history Claude received with the last message. */
const historyOf = () => app.assistant.lastData().history as { proposedEvents: Record<string, unknown>[] }[];

type Item = { kind: "new"; index: number } | { kind: "move"; eventId: string };

const edit = (id: string, item: Item, start: string, end: string, version = 0, headers?: Record<string, string>) =>
  editDraft(postJson(`/api/chat/drafts/${id}/edit`, { version, item, start, end }, headers), app.deps, id);
const accept = (id: string) => acceptDraft(postJson(`/api/chat/drafts/${id}/accept`, {}), app.deps, id);
const first: Item = { kind: "new", index: 0 };

const refused = (status: number, error: string, message: string) => ({ status, body: { error, message } });

const draftRow = async (draftId: string) =>
  (await app.db.admin<{ version: number; proposed_events: { start_at: string; end_at: string }[] }>(
    "select version, proposed_events from app.draft_plans where id = $1",
    [draftId],
  ))[0];

/** Tuesday's lecture 14:00-15:00, which the draft moves to 16:00-17:00. */
async function lectureMove(userId: string): Promise<{ lecture: { id: string; updatedAt: string }; change: SeedChange }> {
  const lecture = await seedEvent(app.db, userId, { title: "Lecture", start: "2026-11-17T14:00:00Z", end: "2026-11-17T15:00:00Z" });
  return {
    lecture,
    change: {
      kind: "move",
      event: lecture,
      title: "Lecture",
      oldStart: "2026-11-17T14:00:00.000Z",
      oldEnd: "2026-11-17T15:00:00.000Z",
      start: "2026-11-17T16:00:00.000Z",
      end: "2026-11-17T17:00:00.000Z",
    },
  };
}

describe("edit_draft: dragging a new event", () => {
  it("moves the block to its new times, keeps everything else, moves the version on; the calendar is unchanged", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);

    const answer = await read(await edit(draftId, first, "2026-11-17T09:00", "2026-11-17T12:00"));

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      message: "Draft changed.",
      draft: {
        id: draftId,
        status: "open",
        version: 1,
        events: [
          { title: "Study", startAt: "2026-11-17T09:00:00.000Z", endAt: "2026-11-17T12:00:00.000Z" },
          { title: "Call", startAt: "2026-11-17T13:30:00.000Z" },
          { title: "Sport" },
          { title: "Event" },
        ],
      },
    });
    expect((await draftRow(draftId)).version).toBe(1);
    expect(await eventsOf(app.db, alice)).toEqual([]);
  });

  it("the bottom edge only: a longer or shorter block", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    expect((await edit(draftId, { kind: "new", index: 1 }, "2026-11-17T13:30", "2026-11-17T15:00")).status).toBe(200);
    expect((await edit(draftId, { kind: "new", index: 1 }, "2026-11-17T13:30", "2026-11-17T13:45", 1)).status).toBe(200);
    expect((await draftRow(draftId)).proposed_events[1]).toMatchObject({ start_at: "2026-11-17T13:30:00.000Z", end_at: "2026-11-17T13:45:00.000Z" });
  });

  it("refuses an overlap with another block of the draft or a fixed event; an event that may overlap never blocks", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedEvent(app.db, alice, { title: "Lunch", start: "2026-11-17T15:00:00Z", end: "2026-11-17T16:00:00Z" });
    await seedEvent(app.db, alice, { title: "Podcast", start: "2026-11-17T16:00:00Z", end: "2026-11-17T17:00:00Z", mayOverlap: true });
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    const before = await app.snapshot();
    const overlap = refused(409, "overlap", "This would overlap another event");

    expect(await read(await edit(draftId, { kind: "new", index: 1 }, "2026-11-17T12:30", "2026-11-17T13:30"))).toEqual(overlap);
    expect(await read(await edit(draftId, { kind: "new", index: 1 }, "2026-11-17T14:30", "2026-11-17T15:30"))).toEqual(overlap);
    expect(await app.snapshot()).toEqual(before);

    expect((await edit(draftId, { kind: "new", index: 1 }, "2026-11-17T16:00", "2026-11-17T17:00")).status).toBe(200);
  });

  it("keeps a new event at 15 minutes to 8 hours", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    const before = await app.snapshot();
    const length = refused(400, "length", "A new event lasts 15 minutes to 8 hours");
    expect(await read(await edit(draftId, first, "2026-11-17T05:00", "2026-11-17T13:15"))).toEqual(length);
    expect(await read(await edit(draftId, first, "2026-11-17T08:00", "2026-11-17T08:10"))).toEqual(length);
    expect(await read(await edit(draftId, first, "2026-11-17T08:00", "2026-11-17T08:00"))).toEqual(refused(400, "end_before_start", "End must be after start"));
    expect(await app.snapshot()).toEqual(before);
    expect((await edit(draftId, first, "2026-11-17T05:00", "2026-11-17T13:00")).status).toBe(200);
  });

  it("refuses a time in the past", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, [{ title: "Read", start: "2026-11-16T10:00:00.000Z", end: "2026-11-16T11:00:00.000Z" }]);
    const before = await app.snapshot();
    expect(await read(await edit(draftId, first, "2026-11-16T08:00", "2026-11-16T09:00"))).toEqual(refused(400, "in_the_past", "This time is in the past"));
    expect(await app.snapshot()).toEqual(before);
    expect((await edit(draftId, first, "2026-11-16T09:00", "2026-11-16T10:00")).status).toBe(200);
  });

  it("keeps a block on its day, ending at the latest at midnight", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    const before = await app.snapshot();
    const otherDay = refused(400, "other_day", "A block stays on its day. Ask the coach to move it to another day");
    expect(await read(await edit(draftId, first, "2026-11-18T08:00", "2026-11-18T09:00"))).toEqual(otherDay);
    expect(await read(await edit(draftId, { kind: "new", index: 3 }, "2026-11-17T23:00", "2026-11-18T00:30"))).toEqual(otherDay);
    expect(await app.snapshot()).toEqual(before);
    expect((await edit(draftId, { kind: "new", index: 3 }, "2026-11-17T23:00", "2026-11-18T00:00")).status).toBe(200);
  });
});

describe("edit_draft: dragging an event the coach moves", () => {
  it("sets the move's new time; the event, its version and its old time stay", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { lecture, change } = await lectureMove(alice);
    const { draftId } = await seedDraft(app.db, alice, [], "open", [change]);

    const answer = await read(await edit(draftId, { kind: "move", eventId: lecture.id }, "2026-11-17T19:00", "2026-11-17T20:30"));

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      draft: {
        version: 1,
        changes: [{ kind: "move", eventId: lecture.id, oldStartAt: "2026-11-17T14:00:00.000Z", startAt: "2026-11-17T19:00:00.000Z", endAt: "2026-11-17T20:30:00.000Z" }],
      },
    });
    const [saved] = await app.db.admin<{ changes: { updated_at: string }[] }>("select changes from app.draft_plans");
    expect(saved.changes[0].updated_at).toBe(change.event.updatedAt);
    // The lecture itself is still at 14:00 until the draft is applied.
    expect((await eventsOf(app.db, alice)).map((e) => new Date(e.start_at as Date).toISOString())).toEqual(["2026-11-17T14:00:00.000Z"]);
  });

  it("refuses more than 24 hours, a delete, and an event the draft does not move", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { lecture, change } = await lectureMove(alice);
    const gym = await seedEvent(app.db, alice, { title: "Gym", start: "2026-11-17T17:00:00Z", end: "2026-11-17T18:00:00Z" });
    const other = await seedEvent(app.db, alice, { title: "Other", start: "2026-11-18T17:00:00Z", end: "2026-11-18T18:00:00Z" });
    const { draftId } = await seedDraft(app.db, alice, [], "open", [
      change,
      { kind: "delete", event: gym, title: "Gym", oldStart: "2026-11-17T17:00:00.000Z", oldEnd: "2026-11-17T18:00:00.000Z" },
    ]);
    const before = await app.snapshot();
    for (const eventId of [gym.id, other.id, "00000000-0000-4000-8000-000000000000", "x"]) {
      expect(await read(await edit(draftId, { kind: "move", eventId }, "2026-11-17T19:00", "2026-11-17T20:00")), eventId).toEqual(
        refused(404, "not_found", "Not found"),
      );
    }
    expect(await app.snapshot()).toEqual(before);
    // A whole day is still allowed for a moved event (as edit_event), but nothing over it can be dragged.
    expect((await edit(draftId, { kind: "move", eventId: lecture.id }, "2026-11-17T09:00", "2026-11-17T23:00")).status).toBe(200);
  });

  it("refuses when the moved event changed since the draft (R4): out of date", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { lecture, change } = await lectureMove(alice);
    const { draftId } = await seedDraft(app.db, alice, [], "open", [change]);
    await app.db.admin("update app.events set title = 'Lecture (room 2)' where id = $1", [lecture.id]);
    const before = await app.snapshot();
    expect(await read(await edit(draftId, { kind: "move", eventId: lecture.id }, "2026-11-17T19:00", "2026-11-17T20:00"))).toEqual(
      refused(409, "draft_out_of_date", "This draft is out of date. Ask again"),
    );
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("edit_draft: which draft, which version", () => {
  it("refuses an older version (R4): another device changed the draft first", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    expect((await edit(draftId, first, "2026-11-17T09:00", "2026-11-17T12:00", 0)).status).toBe(200);
    const before = await app.snapshot();
    expect(await read(await edit(draftId, { kind: "new", index: 1 }, "2026-11-17T14:00", "2026-11-17T14:30", 0))).toEqual(
      refused(409, "changed_elsewhere", "Changed on another device. Reload to see the latest version"),
    );
    expect(await app.snapshot()).toEqual(before);
    expect((await edit(draftId, { kind: "new", index: 1 }, "2026-11-17T14:00", "2026-11-17T14:30", 1)).status).toBe(200);
  });

  it.each(["rejected", "replaced", "accepted"] as const)("refuses a %s draft: 'This draft is no longer open'", async (status) => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS, status);
    const before = await app.snapshot();
    expect(await read(await edit(draftId, first, "2026-11-17T09:00", "2026-11-17T12:00"))).toEqual(
      refused(409, "draft_not_open", "This draft is no longer open"),
    );
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 'Not found' for another user's draft, a missing one, a malformed id and a place not in the list (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedDraft(app.db, bob, A5_PROPOSALS);
    const alice = await app.signedInAs("alice@example.com");
    const own = await seedDraft(app.db, alice, A5_PROPOSALS);
    const before = await app.snapshot();
    for (const id of [bobs.draftId, "00000000-0000-4000-8000-000000000000", "x"]) {
      expect(await read(await edit(id, first, "2026-11-17T09:00", "2026-11-17T12:00")), id).toEqual(refused(404, "not_found", "Not found"));
    }
    expect(await read(await edit(own.draftId, { kind: "new", index: 4 }, "2026-11-17T09:00", "2026-11-17T12:00"))).toEqual(
      refused(404, "not_found", "Not found"),
    );
    expect(await app.snapshot()).toEqual(before);
  });

  it("refuses a malformed body or a time that is not a local date-time", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    const before = await app.snapshot();
    for (const body of [
      {},
      { version: 0, item: first, start: "2026-11-17T09:00" },
      { version: -1, item: first, start: "2026-11-17T09:00", end: "2026-11-17T10:00" },
      { version: 0, item: { kind: "delete", eventId: "x" }, start: "2026-11-17T09:00", end: "2026-11-17T10:00" },
      { version: 0, item: first, start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00" },
      { version: 0, item: first, start: "tomorrow", end: "2026-11-17T10:00" },
      { version: 0, item: first, start: "2026-11-17T09:00", end: "2026-11-17T10:00", title: "Renamed" },
    ]) {
      const response = await editDraft(postJson(`/api/chat/drafts/${draftId}/edit`, body), app.deps, draftId);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 401 without a session and 403 from another site", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    expect((await edit(draftId, first, "2026-11-17T09:00", "2026-11-17T12:00", 0, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    await app.auth.signOut();
    expect((await edit(draftId, first, "2026-11-17T09:00", "2026-11-17T12:00")).status).toBe(401);
    expect(await draftRow(draftId)).toMatchObject({ version: 0, proposed_events: [{ start_at: "2026-11-17T08:00:00.000Z" }, {}, {}, {}] });
  });
});

describe("after a drag", () => {
  it("accepting applies the draft as the person left it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    await edit(draftId, { kind: "new", index: 2 }, "2026-11-17T17:00", "2026-11-17T18:00");
    expect((await accept(draftId)).status).toBe(201);
    expect((await eventsOf(app.db, alice)).map((e) => [e.title, new Date(e.start_at as Date).toISOString()])).toContainEqual([
      "Sport",
      "2026-11-17T17:00:00.000Z",
    ]);
  });

  it("the history sent to Claude marks the draft 'adjusted by the person'; an unchanged draft is not marked", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    app.assistant.answerJson({ kind: "text", text: "Fine.", events: [], changes: [] });
    await sendMessage(postJson("/api/chat/messages", { text: "Thanks" }), app.deps);
    expect(historyOf()[1]).not.toHaveProperty("draftNote");

    await app.db.admin("delete from app.chat_messages where role = 'user' and text = 'Thanks' or text = 'Fine.'");
    await edit(draftId, first, "2026-11-17T09:00", "2026-11-17T12:00");
    app.assistant.answerJson({ kind: "text", text: "Fine.", events: [], changes: [] });
    await sendMessage(postJson("/api/chat/messages", { text: "Thanks" }), app.deps);
    expect(historyOf()[1]).toMatchObject({
      draftStatus: "open",
      draftNote: "adjusted by the person",
    });
    expect(historyOf()[1].proposedEvents[0]).toMatchObject({ title: "Study", start: "2026-11-17T09:00", end: "2026-11-17T12:00" });
  });
});
