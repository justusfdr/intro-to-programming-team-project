// Tests for accept_draft (spec 19; ontology section 5, R1, R3, R4, R21, R23, A5): the events created in
// one step with source "assistant", the checks run again against the calendar as it is now, a draft
// accepted only once (also from two devices at once), and "Not found" for foreign, missing or
// malformed ids. Assistant events then behave like app events.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { A5_ANSWER, A5_PROPOSALS, draftsOf, seedDraft, setPlan } from "@test/support/chat";
import { eventsOf, seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { acceptDraft } from "./accept-draft";
import { deleteEvent } from "./delete-event";
import { editEvent } from "./edit-event";
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

afterEach(() => {
  vi.unstubAllEnvs();
});

function accept(id: string, headers?: Record<string, string>) {
  return acceptDraft(postJson(`/api/chat/drafts/${id}/accept`, {}, headers), app.deps, id);
}

const OUT_OF_DATE = { status: 409, body: { error: "draft_out_of_date", message: "This draft is out of date. Ask again" } };
const NOT_OPEN = { status: 409, body: { error: "draft_not_open", message: "This draft is no longer open" } };

describe("accept_draft accepted", () => {
  it("A5 end to end: send_message, then accept: 4 events with source 'assistant', the draft accepted", async () => {
    const alice = await app.signedInAs("alice@example.com");
    app.assistant.answerJson(A5_ANSWER);
    const sent = await read(await sendMessage(postJson("/api/chat/messages", { text: "Plan tomorrow" }), app.deps));
    const draftId = (sent.body.messages as { draft: { id: string } | null }[])[1].draft!.id;
    expect(await eventsOf(app.db, alice)).toEqual([]);

    const answer = await read(await accept(draftId));

    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({
      message: "Added to your calendar.",
      draftId,
      events: [
        { title: "Study", startAt: "2026-11-17T08:00:00.000Z", endAt: "2026-11-17T13:00:00.000Z", source: "assistant", status: "planned", allDay: false },
        { title: "Call", source: "assistant" },
        { title: "Sport", source: "assistant" },
        { title: "Event", source: "assistant" },
      ],
    });
    const events = await eventsOf(app.db, alice);
    expect(events).toHaveLength(4);
    expect(events.every((e) => e.source === "assistant" && e.status === "planned" && e.may_overlap === false)).toBe(true);
    expect(await draftsOf(app.db, alice)).toEqual([{ id: draftId, status: "accepted" }]);
  });

  it("keeps each proposal's goal", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "hours", target: 4 }] });
    const { draftId } = await seedDraft(app.db, alice, [{ ...A5_PROPOSALS[0], goalId: goal.id }, A5_PROPOSALS[1]]);
    expect((await accept(draftId)).status).toBe(201);
    expect((await eventsOf(app.db, alice)).map((e) => e.goal_id)).toEqual([goal.id, null]);
  });

  it("is fine next to an event that may overlap and right after one that may not", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedEvent(app.db, alice, { title: "Podcast", start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00:00Z", mayOverlap: true });
    await seedEvent(app.db, alice, { title: "Breakfast", start: "2026-11-17T07:30:00Z", end: "2026-11-17T08:00:00Z" });
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    expect((await accept(draftId)).status).toBe(201);
  });

  it("assistant events behave like app events: they can be edited and deleted", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS.slice(0, 1));
    const created = await read(await accept(draftId));
    const event = (created.body.events as { id: string; updatedAt: string }[])[0];

    const edited = await read(
      await editEvent(
        postJson(`/api/events/${event.id}/edit`, { title: "Revision", start: "2026-11-17T09:00", end: "2026-11-17T12:00", updatedAt: event.updatedAt }),
        app.deps,
        event.id,
      ),
    );
    expect(edited.status).toBe(200);
    const updatedAt = (edited.body.event as { updatedAt: string }).updatedAt;
    expect(
      (await deleteEvent(postJson(`/api/events/${event.id}/delete`, { updatedAt }), app.deps, event.id)).status,
    ).toBe(200);
    expect(await eventsOf(app.db, alice)).toEqual([]);
  });
});

describe("accept_draft rejected: nothing changes (R1)", () => {
  it("a second accept: 'This draft is no longer open'; no events added twice", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    expect((await accept(draftId)).status).toBe(201);
    const before = await app.snapshot();
    expect(await read(await accept(draftId))).toEqual(NOT_OPEN);
    expect(await app.snapshot()).toEqual(before);
  });

  it("two devices accepting the same draft at once: one gets the events, the other 'no longer open'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    const answers = await Promise.all((await Promise.all([accept(draftId), accept(draftId)])).map(read));
    expect(answers.map((a) => a.status).sort()).toEqual([201, 409]);
    expect(answers.find((a) => a.status === 409)).toEqual(NOT_OPEN);
    expect(await eventsOf(app.db, alice)).toHaveLength(4);
  });

  it.each(["rejected", "replaced", "accepted"] as const)("a %s draft: 'This draft is no longer open'", async (status) => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS, status);
    const before = await app.snapshot();
    expect(await read(await accept(draftId))).toEqual(NOT_OPEN);
    expect(await app.snapshot()).toEqual(before);
  });

  it("once a proposed event has started: 'This draft is out of date. Ask again'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    app.advance(23 * 3_600_000 + 60_000); // Tuesday 08:01, Study began at 08:00
    const before = await app.snapshot();
    expect(await read(await accept(draftId))).toEqual(OUT_OF_DATE);
    expect(await app.snapshot()).toEqual(before);
  });

  it("when an event that may not overlap now stands in the way: out of date", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    await seedEvent(app.db, alice, { title: "Dentist", start: "2026-11-17T13:45:00Z", end: "2026-11-17T14:15:00Z" });
    const before = await app.snapshot();
    expect(await read(await accept(draftId))).toEqual(OUT_OF_DATE);
    expect(await app.snapshot()).toEqual(before);
  });

  it("when a proposal's goal was deleted since: out of date", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "hours", target: 4 }] });
    const { draftId } = await seedDraft(app.db, alice, [{ ...A5_PROPOSALS[0], goalId: goal.id }]);
    await app.db.admin("delete from app.goals where id = $1", [goal.id]);
    const before = await app.snapshot();
    expect(await read(await accept(draftId))).toEqual(OUT_OF_DATE);
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 'Not found' for another user's draft, a missing draft and a malformed id (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedDraft(app.db, bob, A5_PROPOSALS);
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    for (const id of [bobs.draftId, "00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      expect(await read(await accept(id)), id).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("with Pro only on, a Free user cannot accept (R21, R5); a Pro user can", async () => {
    vi.stubEnv("CHAT_PRO_ONLY", "true");
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    const before = await app.snapshot();
    expect(await read(await accept(draftId))).toEqual({ status: 403, body: { error: "pro_only", message: "The AI chat is part of Pro" } });
    expect(await app.snapshot()).toEqual(before);
    await setPlan(app.db, alice, "pro");
    expect((await accept(draftId)).status).toBe(201);
  });

  it("answers 401 without a session and 403 from another site", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    const before = await app.snapshot();
    expect((await accept(draftId, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    await app.auth.signOut();
    expect((await read(await accept(draftId))).status).toBe(401);
    const after = await app.snapshot();
    expect(after.tables).toEqual(before.tables);
  });
});
