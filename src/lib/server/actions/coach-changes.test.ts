// Tests for spec 20 on the server, with the fake assistant and the temporary database: send_message
// with references and changes (R22, R23), accept_draft applying moves and deletes in one step (R1, R4,
// R11, R26, R28), undo_draft (R38's way of putting things back), and the page loader's days.
// Every rule with an accepted and a rejected case; a refusal changes nothing.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { chatOf, draftsOf, seedDraft, setPlan, type SeedChange } from "@test/support/chat";
import { eventsOf, seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { loadChatPage } from "@/lib/server/pages/load";
import { acceptDraft } from "./accept-draft";
import { editEvent } from "./edit-event";
import { sendMessage } from "./send-message";
import { undoDraft } from "./undo-draft";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // Monday 16 November 2026, 09:00 UTC (09:00 in Lisbon)
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const send = (text: string) => sendMessage(postJson("/api/chat/messages", { text }), app.deps);
const accept = (id: string) => acceptDraft(postJson(`/api/chat/drafts/${id}/accept`, {}), app.deps, id);
const undo = (id: string, headers?: Record<string, string>) => undoDraft(postJson(`/api/chat/drafts/${id}/undo`, {}, headers), app.deps, id);

const OUT_OF_DATE = { status: 409, body: { error: "draft_out_of_date", message: "This draft is out of date. Ask again" } };
const CANNOT_UNDO = { status: 409, body: { error: "cannot_undo", message: "This can no longer be undone" } };
const FAILED = { status: 502, body: { error: "answer_failed_checks", message: "The assistant's answer failed our checks. Please try again" } };

/** Tuesday's lecture 14:00-15:00 and gym 17:00-18:00 (Lisbon is UTC in November). */
async function tuesday(userId: string) {
  const lecture = await seedEvent(app.db, userId, { title: "Lecture", start: "2026-11-17T14:00:00Z", end: "2026-11-17T15:00:00Z" });
  const gym = await seedEvent(app.db, userId, { title: "Gym", start: "2026-11-17T17:00:00Z", end: "2026-11-17T18:00:00Z" });
  return { lecture, gym };
}

const moveLecture = (lecture: { id: string; updatedAt: string }, start = "2026-11-17T16:00:00.000Z", end = "2026-11-17T17:00:00.000Z"): SeedChange => ({
  kind: "move",
  event: lecture,
  title: "Lecture",
  oldStart: "2026-11-17T14:00:00.000Z",
  oldEnd: "2026-11-17T15:00:00.000Z",
  start,
  end,
});
const deleteGym = (gym: { id: string; updatedAt: string }): SeedChange => ({
  kind: "delete",
  event: gym,
  title: "Gym",
  oldStart: "2026-11-17T17:00:00.000Z",
  oldEnd: "2026-11-17T18:00:00.000Z",
});

const times = async (userId: string) =>
  (await eventsOf(app.db, userId)).map((e) => [e.title, new Date(e.start_at as Date).toISOString(), e.status, e.source]);

describe("send_message with changes", () => {
  it("gives each event a reference and a flag, never its id; turns the reference in the answer back into the event", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { lecture } = await tuesday(alice);
    app.assistant.answerJson({
      kind: "draft",
      text: "Moved the lecture to 16:00.",
      events: [],
      changes: [{ ref: "e1", action: "move", start: "2026-11-17T16:00", end: "2026-11-17T17:00" }],
    });

    const answer = await read(await send("Move the lecture to 4pm"));

    expect(answer.status).toBe(201);
    const data = app.assistant.lastData();
    expect(data.events).toEqual([
      { ref: "e1", changeable: true, title: "Lecture", allDay: false, start: "2026-11-17T14:00", end: "2026-11-17T15:00", mayOverlap: false },
      { ref: "e2", changeable: true, title: "Gym", allDay: false, start: "2026-11-17T17:00", end: "2026-11-17T18:00", mayOverlap: false },
    ]);
    expect(app.assistant.requests[0].data).not.toContain(lecture.id);
    expect(answer.body).toMatchObject({
      messages: [
        {},
        {
          draft: {
            status: "open",
            events: [],
            changes: [
              {
                kind: "move",
                eventId: lecture.id,
                title: "Lecture",
                oldStartAt: "2026-11-17T14:00:00.000Z",
                oldEndAt: "2026-11-17T15:00:00.000Z",
                startAt: "2026-11-17T16:00:00.000Z",
                endAt: "2026-11-17T17:00:00.000Z",
              },
            ],
          },
        },
      ],
    });
    const [saved] = await app.db.admin<{ changes: { event_id: string; updated_at: string }[] }>("select changes from app.draft_plans");
    expect(saved.changes[0]).toMatchObject({ event_id: lecture.id, updated_at: lecture.updatedAt });
    // Nothing in the calendar changed yet.
    expect(await times(alice)).toEqual([
      ["Lecture", "2026-11-17T14:00:00.000Z", "planned", "app"],
      ["Gym", "2026-11-17T17:00:00.000Z", "planned", "app"],
    ]);
  });

  it("flags Outlook events, events of a series, all-day events and started events as not changeable; a change to one fails the checks", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const outlook = await seedEvent(app.db, alice, { title: "Team call", start: "2026-11-17T10:00:00Z", end: "2026-11-17T11:00:00Z" });
    await app.db.admin("update app.events set source = 'outlook', outlook_id = 'o-1' where id = $1", [outlook.id]);
    const series = await seedEvent(app.db, alice, { title: "Run", start: "2026-11-17T07:00:00Z", end: "2026-11-17T08:00:00Z" });
    await app.db.admin("update app.events set series_id = gen_random_uuid() where id = $1", [series.id]);
    await seedEvent(app.db, alice, { title: "Breakfast", start: "2026-11-16T08:30:00Z", end: "2026-11-16T09:30:00Z" });
    await app.db.admin("insert into app.events (user_id, title, all_day, first_day, last_day) values ($1, 'Exam week', true, '2026-11-17', '2026-11-20')", [alice]);

    app.assistant.answerJson({ kind: "text", text: "Okay.", events: [], changes: [] });
    await send("What can you move?");
    const flags = (app.assistant.lastData().events as { title: string; changeable: boolean }[]).map((e) => [e.title, e.changeable]);
    expect(flags).toEqual([
      ["Breakfast", false],
      ["Exam week", false],
      ["Run", false],
      ["Team call", false],
    ]);

    const refs = (app.assistant.lastData().events as { ref: string }[]).map((e) => e.ref);
    for (const ref of refs) {
      const before = await app.snapshot();
      app.assistant.answerJson({ kind: "draft", text: "Removed.", events: [], changes: [{ ref, action: "delete", start: null, end: null }] });
      expect(await read(await send("Delete it")), ref).toEqual(FAILED);
      const after = await app.snapshot();
      // Only the day counter moved (R1's exception).
      delete (after.tables as Record<string, unknown>).profiles;
      delete (before.tables as Record<string, unknown>).profiles;
      expect(after).toEqual(before);
    }
  });

  it("an unknown reference or a move onto an event that stays fails the checks; nothing saved", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await tuesday(alice);
    for (const changes of [
      [{ ref: "e7", action: "delete", start: null, end: null }],
      [{ ref: "e1", action: "move", start: "2026-11-17T17:30", end: "2026-11-17T18:30" }],
    ]) {
      app.assistant.answerJson({ kind: "draft", text: "Done.", events: [], changes });
      expect(await read(await send("Change it"))).toEqual(FAILED);
    }
    expect(await chatOf(app.db, alice)).toEqual([]);
  });

  it("sends an earlier draft's changes in words", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { lecture, gym } = await tuesday(alice);
    await seedDraft(app.db, alice, [], "accepted", [moveLecture(lecture), deleteGym(gym)]);
    await send("Put it back");
    const history = app.assistant.lastData().history as Record<string, unknown>[];
    expect(history[1]).toMatchObject({
      draftStatus: "accepted",
      changes: [
        { change: "move", title: "Lecture", from: "2026-11-17T14:00", fromEnd: "2026-11-17T15:00", to: "2026-11-17T16:00", toEnd: "2026-11-17T17:00" },
        { change: "delete", title: "Gym", start: "2026-11-17T17:00", end: "2026-11-17T18:00" },
      ],
    });
    expect(JSON.stringify(history)).not.toContain(lecture.id);
  });
});

describe("accept_draft with changes", () => {
  it("applies moves, deletes and new events in one step: 'Your calendar is updated.'; a new event may take a freed time", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { lecture, gym } = await tuesday(alice);
    const { draftId } = await seedDraft(app.db, alice, [{ title: "Study", start: "2026-11-17T14:00:00.000Z", end: "2026-11-17T15:30:00.000Z" }], "open", [
      moveLecture(lecture, "2026-11-17T17:00:00.000Z", "2026-11-17T18:00:00.000Z"),
      deleteGym(gym),
    ]);

    const answer = await read(await accept(draftId));

    expect(answer).toMatchObject({ status: 201, body: { message: "Your calendar is updated.", draftId, events: [{ title: "Study", source: "assistant" }] } });
    expect(await times(alice)).toEqual([
      ["Study", "2026-11-17T14:00:00.000Z", "planned", "assistant"],
      ["Lecture", "2026-11-17T17:00:00.000Z", "planned", "app"],
    ]);
    expect(await draftsOf(app.db, alice)).toEqual([{ id: draftId, status: "accepted" }]);
  });

  it("Outlook gets the change as after a change by hand (R26): a sent event moved is sent again, a sent event deleted is deleted there", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { lecture, gym } = await tuesday(alice);
    await app.db.admin("update app.events set outlook_id = 'out-' || title, outlook_sent_version = updated_at where user_id = $1", [alice]);
    const { draftId } = await seedDraft(app.db, alice, [], "open", [moveLecture(lecture), deleteGym(gym)]);
    expect((await accept(draftId)).status).toBe(201);
    expect(await app.db.admin("select outlook_id from app.outlook_deletions where user_id = $1", [alice])).toEqual([{ outlook_id: "out-Gym" }]);
    expect(await app.db.admin("select outlook_sent_version = updated_at as sent from app.events where user_id = $1", [alice])).toEqual([{ sent: false }]);
  });

  it("an event changed since the draft saw it (R4), one that has started, or a new event in the way: out of date, nothing changed", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { lecture } = await tuesday(alice);

    const spoilers: [string, () => Promise<unknown>][] = [
      ["edited elsewhere", () => app.db.admin("update app.events set title = 'Lecture (room 2)' where id = $1", [lecture.id])],
      ["deleted elsewhere", () => app.db.admin("delete from app.events where id = $1", [lecture.id])],
      ["something new in the way", () => seedEvent(app.db, alice, { title: "Dentist", start: "2026-11-17T16:30:00Z", end: "2026-11-17T17:00:00Z" })],
    ];
    for (const [name, spoil] of spoilers) {
      await app.db.admin("delete from app.events where user_id = $1", [alice]);
      await app.db.admin("delete from app.chat_messages where user_id = $1", [alice]);
      const fresh = await seedEvent(app.db, alice, { title: "Lecture", start: "2026-11-17T14:00:00Z", end: "2026-11-17T15:00:00Z" });
      lecture.id = fresh.id;
      const { draftId } = await seedDraft(app.db, alice, [], "open", [moveLecture(fresh)]);
      await spoil();
      const before = await app.snapshot();
      expect(await read(await accept(draftId)), name).toEqual(OUT_OF_DATE);
      expect(await app.snapshot(), name).toEqual(before);
    }

    await app.db.admin("delete from app.chat_messages where user_id = $1", [alice]);
    await app.db.admin("delete from app.events where user_id = $1", [alice]);
    const fresh = await seedEvent(app.db, alice, { title: "Lecture", start: "2026-11-17T14:00:00Z", end: "2026-11-17T15:00:00Z" });
    const { draftId } = await seedDraft(app.db, alice, [], "open", [moveLecture(fresh, "2026-11-18T10:00:00.000Z", "2026-11-18T11:00:00.000Z")]);
    app.advance(29 * 3_600_000 + 60_000); // Tuesday 14:01: the lecture has started
    const before = await app.snapshot();
    expect(await read(await accept(draftId))).toEqual(OUT_OF_DATE);
    expect(await app.snapshot()).toEqual(before);
  });

  it("an event that became part of a series since: out of date, nothing changed (R28)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { lecture } = await tuesday(alice);
    const { draftId } = await seedDraft(app.db, alice, [], "open", [moveLecture(lecture)]);
    // The database refuses it on its own too (test/db/coach-changes-schema.test.ts).
    await app.db.admin("update app.events set series_id = gen_random_uuid() where id = $1", [lecture.id]);
    const before = await app.snapshot();
    expect(await read(await accept(draftId))).toEqual(OUT_OF_DATE);
    expect(await app.snapshot()).toEqual(before);
  });

  it("two devices at once: one applies, the other 'no longer open'; the lecture moved once", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { lecture, gym } = await tuesday(alice);
    const { draftId } = await seedDraft(app.db, alice, [], "open", [moveLecture(lecture), deleteGym(gym)]);
    const answers = await Promise.all((await Promise.all([accept(draftId), accept(draftId)])).map(read));
    expect(answers.map((a) => a.status).sort()).toEqual([201, 409]);
    expect(await times(alice)).toEqual([["Lecture", "2026-11-17T16:00:00.000Z", "planned", "app"]]);
  });
});

describe("undo_draft", () => {
  async function appliedDraft() {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "hours", target: 4 }] });
    const { lecture } = await tuesday(alice);
    const gym = await seedEvent(app.db, alice, { title: "Swim", start: "2026-11-18T07:00:00Z", end: "2026-11-18T08:00:00Z", status: "done", goalId: goal.id });
    const before = await eventsOf(app.db, alice);
    const { draftId } = await seedDraft(app.db, alice, [{ title: "Study", start: "2026-11-17T10:00:00.000Z", end: "2026-11-17T12:00:00.000Z" }], "open", [
      moveLecture(lecture),
      { kind: "delete", event: gym, title: "Swim", oldStart: "2026-11-18T07:00:00.000Z", oldEnd: "2026-11-18T08:00:00.000Z" },
    ]);
    const accepted = await read(await accept(draftId));
    expect(accepted.status).toBe(201);
    return { alice, draftId, before, created: (accepted.body.events as { id: string; updatedAt: string }[])[0] };
  }

  const comparable = (rows: Record<string, unknown>[]) =>
    rows.map((e) => [e.title, new Date(e.start_at as Date).toISOString(), new Date(e.end_at as Date).toISOString(), e.status, e.source, e.goal_id]);

  it("puts the calendar back as it was: 'Undone. Your calendar is as before.'; the deleted event comes back done; the draft is undone", async () => {
    const { alice, draftId, before } = await appliedDraft();

    expect(await read(await undo(draftId))).toEqual({ status: 200, body: { message: "Undone. Your calendar is as before.", draftId } });

    expect(comparable(await eventsOf(app.db, alice))).toEqual(comparable(before));
    expect(await draftsOf(app.db, alice)).toEqual([{ id: draftId, status: "undone" }]);
    // The page shows it as undone.
    const page = await loadChatPage(app.deps, alice);
    expect(page.messages[1].draft?.status).toBe("undone");
  });

  it("only once: the second undo is 'This can no longer be undone'", async () => {
    const { draftId } = await appliedDraft();
    expect((await undo(draftId)).status).toBe(200);
    const before = await app.snapshot();
    expect(await read(await undo(draftId))).toEqual(CANNOT_UNDO);
    expect(await app.snapshot()).toEqual(before);
  });

  it("not once an event it created or moved was changed since: 'This can no longer be undone', nothing changed", async () => {
    const { draftId, created } = await appliedDraft();
    const edited = await editEvent(
      postJson(`/api/events/${created.id}/edit`, { title: "Study hard", start: "2026-11-17T10:00", end: "2026-11-17T12:00", updatedAt: created.updatedAt }),
      app.deps,
      created.id,
    );
    expect(edited.status).toBe(200);
    const before = await app.snapshot();
    expect(await read(await undo(draftId))).toEqual(CANNOT_UNDO);
    expect(await app.snapshot()).toEqual(before);
  });

  it("not for an open, rejected or replaced draft", async () => {
    const alice = await app.signedInAs("alice@example.com");
    for (const status of ["open", "rejected", "replaced"] as const) {
      await app.db.admin("delete from app.chat_messages where user_id = $1", [alice]);
      const { draftId } = await seedDraft(app.db, alice, [{ title: "Study", start: "2026-11-17T10:00:00.000Z", end: "2026-11-17T12:00:00.000Z" }], status);
      const before = await app.snapshot();
      expect(await read(await undo(draftId)), status).toEqual(CANNOT_UNDO);
      expect(await app.snapshot()).toEqual(before);
    }
  });

  it("answers 'Not found' for another user's draft, a missing draft and a malformed id (R3)", async () => {
    const { draftId } = await appliedDraft();
    await app.signedInAs("bob@example.com");
    const before = await app.snapshot();
    for (const id of [draftId, "00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      expect(await read(await undo(id)), id).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("with Pro only on, a Free user cannot undo (R21, R5); a Pro user can", async () => {
    const { alice, draftId } = await appliedDraft();
    vi.stubEnv("CHAT_PRO_ONLY", "true");
    const before = await app.snapshot();
    expect(await read(await undo(draftId))).toEqual({ status: 403, body: { error: "pro_only", message: "The AI chat is part of Pro" } });
    expect(await app.snapshot()).toEqual(before);
    await setPlan(app.db, alice, "pro");
    expect((await undo(draftId)).status).toBe(200);
  });

  it("answers 401 without a session and 403 from another site", async () => {
    const { draftId } = await appliedDraft();
    const before = await app.snapshot();
    expect((await undo(draftId, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    await app.auth.signOut();
    expect((await read(await undo(draftId))).status).toBe(401);
    expect((await app.snapshot()).tables).toEqual(before.tables);
  });
});

describe("the page loader with changes", () => {
  it("adds a moved event's old and new day and a deleted event's day, with the events on them", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { lecture } = await tuesday(alice);
    const friday = await seedEvent(app.db, alice, { title: "Friday", start: "2026-11-20T09:00:00Z", end: "2026-11-20T10:00:00Z" });
    await seedDraft(app.db, alice, [], "open", [
      moveLecture(lecture, "2026-11-19T10:00:00.000Z", "2026-11-19T11:00:00.000Z"),
      { kind: "delete", event: friday, title: "Friday", oldStart: "2026-11-20T09:00:00.000Z", oldEnd: "2026-11-20T10:00:00.000Z" },
    ]);
    const page = await loadChatPage(app.deps, alice);
    expect(page.draftDays).toEqual(["2026-11-17", "2026-11-19", "2026-11-20"]);
    expect(page.draftDayEvents.map((e) => e.title)).toEqual(["Lecture", "Gym", "Friday"]);
    expect(page.messages[1].draft?.changes.map((c) => [c.kind, c.eventId])).toEqual([
      ["move", lecture.id],
      ["delete", friday.id],
    ]);
  });
});
