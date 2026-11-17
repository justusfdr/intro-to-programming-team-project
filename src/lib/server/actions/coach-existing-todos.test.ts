// Spec 23 on the coach's server side, with the fake assistant and the temporary database: the owner's
// sentence "For that one I also want the to-dos: …" about an event already in the calendar becomes a
// draft that adds them; nothing changes before "Apply changes"; accepting writes them at the end of the
// event's list in one step; undo removes exactly them. What Claude receives: each event's count of
// to-dos (never the titles) and whether it takes to-dos. Every rule with an accepted and a refused case.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { draftsOf, sentToday } from "@test/support/chat";
import { seedAllDay, seedEvent } from "@test/support/events";
import { loadChatPage } from "@/lib/server/pages/load";
import { acceptDraft } from "./accept-draft";
import { editDraft } from "./edit-draft";
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
  vi.restoreAllMocks();
});

const send = (text: string) => sendMessage(postJson("/api/chat/messages", { text }), app.deps);
const accept = (id: string) => acceptDraft(postJson(`/api/chat/drafts/${id}/accept`, {}), app.deps, id);
const undo = (id: string) => undoDraft(postJson(`/api/chat/drafts/${id}/undo`, {}), app.deps, id);
const edit = (id: string, item: unknown, start: string, end: string, version = 0) =>
  editDraft(postJson(`/api/chat/drafts/${id}/edit`, { version, item, start, end }), app.deps, id);

const OWNER = "For that one I also want the to-dos: do the investment exercises, and watch the investment lecture.";
const TODOS = ["Do the investment exercises", "Watch the investment lecture"];

const todosOf = (eventId: string) =>
  app.db.admin<{ title: string; done: boolean; position: number }>(
    "select title, done, position from app.event_todos where event_id = $1 order by position",
    [eventId],
  );

async function lernblock(userId: string, todos: string[] = []) {
  const event = await seedEvent(app.db, userId, { title: "Lernblock", start: "2026-11-17T14:00:00Z", end: "2026-11-17T16:00:00Z" });
  for (const [i, title] of todos.entries()) {
    await app.db.admin("insert into app.event_todos (user_id, event_id, title, position) values ($1, $2, $3, $4)", [userId, event.id, title, i]);
  }
  return event;
}

/** Sends the owner's sentence with a fake answer that adds the to-dos to `ref`; returns the draft's id. */
async function draftFor(ref: string, todos = TODOS): Promise<string> {
  app.assistant.answerJson({ kind: "draft", text: "This draft adds the two to-dos to Lernblock.", events: [], changes: [], addTodos: [{ ref, todos }] });
  const sent = await read(await send(OWNER));
  expect(sent.status).toBe(201);
  return (sent.body.messages as { draft: { id: string } }[])[1].draft.id;
}

describe("the owner's example", () => {
  it("drafts the to-dos, changes nothing before applying, writes them at the end of the list on accept, and undo removes them", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const event = await lernblock(alice, ["Read the slides"]);

    app.assistant.answerJson({ kind: "draft", text: "This draft adds the two to-dos to Lernblock.", events: [], changes: [], addTodos: [{ ref: "e1", todos: TODOS }] });
    const sent = await read(await send(OWNER));

    // Claude saw the count, never the titles, and no id.
    expect(app.assistant.lastData().events).toEqual([
      { ref: "e1", changeable: true, title: "Lernblock", allDay: false, start: "2026-11-17T14:00", end: "2026-11-17T16:00", mayOverlap: false, todoCount: 1 },
    ]);
    expect(app.assistant.requests[0].data).not.toContain("Read the slides");
    expect(app.assistant.requests[0].data).not.toContain(event.id);

    expect(sent.status).toBe(201);
    const draft = (sent.body.messages as { draft: Record<string, unknown> }[])[1].draft;
    expect(draft).toMatchObject({
      status: "open",
      events: [],
      changes: [],
      addedTodos: [
        {
          eventId: event.id,
          title: "Lernblock",
          allDay: false,
          startAt: "2026-11-17T14:00:00.000Z",
          endAt: "2026-11-17T16:00:00.000Z",
          firstDay: null,
          lastDay: null,
          todos: TODOS,
        },
      ],
    });
    // Only a proposal: the event's list is unchanged.
    expect(await todosOf(event.id)).toEqual([{ title: "Read the slides", done: false, position: 0 }]);

    // The page shows the event's day and the draft.
    const page = await loadChatPage(app.deps, alice);
    expect(page.draftDays).toEqual(["2026-11-17"]);
    expect(page.draftDayEvents.map((e) => e.title)).toEqual(["Lernblock"]);
    expect(page.messages[1].draft!.addedTodos![0].todos).toEqual(TODOS);

    // The next message carries the draft in words.
    app.assistant.answerJson({ kind: "text", text: "Fine.", events: [], changes: [], addTodos: [] });
    await send("Thanks");
    const history = app.assistant.lastData().history as { addedTodos?: unknown }[];
    expect(history[1].addedTodos).toEqual([{ title: "Lernblock", todos: TODOS }]);

    const draftId = draft.id as string;
    const accepted = await read(await accept(draftId));
    expect(accepted).toEqual({ status: 201, body: { message: "Your calendar is updated.", draftId, events: [] } });
    expect(await todosOf(event.id)).toEqual([
      { title: "Read the slides", done: false, position: 0 },
      { title: "Do the investment exercises", done: false, position: 1 },
      { title: "Watch the investment lecture", done: false, position: 2 },
    ]);
    // R40: the event itself is unchanged.
    const [row] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [event.id]);
    expect(new Date(row.updated_at).toISOString()).toBe(event.updatedAt);

    // Undo removes exactly them, also a ticked one.
    await app.db.admin("update app.event_todos set done = true where title = 'Do the investment exercises'");
    expect(await read(await undo(draftId))).toEqual({ status: 200, body: { message: "Undone. Your calendar is as before.", draftId } });
    expect(await todosOf(event.id)).toEqual([{ title: "Read the slides", done: false, position: 0 }]);
  });
});

describe("which events take to-dos from the coach", () => {
  it("events of a series, all-day events and started events do; an Outlook event is flagged and an answer naming it fails", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await app.db.admin(
      `insert into app.events (user_id, title, start_at, end_at, series_id) values ($1, 'Lecture', '2026-11-17T09:00:00Z', '2026-11-17T10:00:00Z', gen_random_uuid())`,
      [alice],
    );
    await seedAllDay(app.db, alice, { title: "Exam week", firstDay: "2026-11-16", lastDay: "2026-11-20" });
    await seedEvent(app.db, alice, { title: "Started", start: "2026-11-16T08:00:00Z", end: "2026-11-16T10:00:00Z" });
    await app.db.admin(
      `insert into app.events (user_id, title, start_at, end_at, source, outlook_id) values ($1, 'Team call', '2026-11-17T11:00:00Z', '2026-11-17T12:00:00Z', 'outlook', 'AAMk-1')`,
      [alice],
    );

    app.assistant.answerJson({ kind: "text", text: "Sure.", events: [], changes: [], addTodos: [] });
    await send("What do I have?");
    const flags = (app.assistant.lastData().events as { ref: string; title: string; canAddTodos?: boolean }[]).map((e) => [e.ref, e.title, e.canAddTodos]);
    expect(flags).toEqual([
      ["e1", "Exam week", undefined],
      ["e2", "Started", undefined],
      ["e3", "Lecture", undefined],
      ["e4", "Team call", false],
    ]);

    // Adding to the first three passes the checks.
    app.assistant.answerJson({
      kind: "draft",
      text: "Added.",
      events: [],
      changes: [],
      addTodos: [
        { ref: "e1", todos: ["Revise"] },
        { ref: "e2", todos: ["Finish"] },
        { ref: "e3", todos: ["Bring the book"] },
      ],
    });
    const ok = await read(await send("Add the to-dos"));
    expect(ok.status).toBe(201);
    const draftId = (ok.body.messages as { draft: { id: string } }[])[1].draft.id;
    expect((await read(await accept(draftId))).status).toBe(201);
    expect(await app.db.admin("select e.title, t.title as todo from app.event_todos t join app.events e on e.id = t.event_id order by e.title")).toEqual([
      { title: "Exam week", todo: "Revise" },
      { title: "Lecture", todo: "Bring the book" },
      { title: "Started", todo: "Finish" },
    ]);

    // The Outlook event: the whole answer fails, nothing saved (spec 44: nothing counted).
    const before = await draftsOf(app.db, alice);
    app.assistant.answerJson({ kind: "draft", text: "Added.", events: [], changes: [], addTodos: [{ ref: "e4", todos: ["Agenda"] }] });
    expect(await read(await send("Add an agenda to the team call"))).toEqual({
      status: 502,
      body: { error: "answer_failed_checks", message: "The assistant's answer failed our checks. Please try again" },
    });
    expect(await draftsOf(app.db, alice)).toEqual(before);
    // Spec 44: nothing is counted.
    expect(await sentToday(app.db, alice)).toBe(0);
  });

  it("an answer that would make the list longer than 20 fails the checks; 18 + 2 passes", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await lernblock(alice, Array.from({ length: 19 }, (_, i) => `Old ${i}`));
    app.assistant.answerJson({ kind: "draft", text: "Added.", events: [], changes: [], addTodos: [{ ref: "e1", todos: TODOS }] });
    expect((await read(await send(OWNER))).status).toBe(502);
    expect(await draftsOf(app.db, alice)).toEqual([]);

    await app.db.admin("delete from app.event_todos where title = 'Old 18'");
    await draftFor("e1");
  });
});

describe("applying (decision 5)", () => {
  it("works when the event was edited since; out of date when it was deleted or its list filled up", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const event = await lernblock(alice);

    // Edited in between: still applied.
    const first = await draftFor("e1");
    await app.db.admin("update app.events set title = 'Lernblock 2', start_at = '2026-11-17T15:00:00Z', end_at = '2026-11-17T17:00:00Z' where id = $1", [event.id]);
    expect((await read(await accept(first))).status).toBe(201);
    expect(await todosOf(event.id)).toHaveLength(2);

    // The list filled up by hand in between: out of date, nothing saved.
    const second = await draftFor("e1");
    for (let i = 2; i < 19; i += 1) {
      await app.db.admin("insert into app.event_todos (user_id, event_id, title, position) values ($1, $2, $3, $4)", [alice, event.id, `By hand ${i}`, i]);
    }
    const snapshot = await app.snapshot();
    expect(await read(await accept(second))).toEqual({
      status: 409,
      body: { error: "draft_out_of_date", message: "This draft is out of date. Ask again" },
    });
    expect(await app.snapshot()).toEqual(snapshot);

    // Deleted in between: out of date.
    await app.db.admin("delete from app.event_todos where position >= 2");
    const third = await draftFor("e1");
    await app.db.admin("delete from app.events where id = $1", [event.id]);
    expect((await read(await accept(third))).body).toMatchObject({ error: "draft_out_of_date" });
  });

  it("an event may be moved and get to-dos in one draft; undo puts both back", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const event = await lernblock(alice);
    app.assistant.answerJson({
      kind: "draft",
      text: "Moved and added.",
      events: [],
      changes: [{ ref: "e1", action: "move", start: "2026-11-17T17:00", end: "2026-11-17T19:00" }],
      addTodos: [{ ref: "e1", todos: TODOS }],
    });
    const sent = await read(await send("Move it to 5 and add the to-dos"));
    const draftId = (sent.body.messages as { draft: { id: string } }[])[1].draft.id;
    expect((await read(await accept(draftId))).status).toBe(201);
    expect(await todosOf(event.id)).toHaveLength(2);
    expect((await read(await undo(draftId))).status).toBe(200);
    const [row] = await app.db.admin<{ start_at: Date }>("select start_at from app.events where id = $1", [event.id]);
    expect(new Date(row.start_at).toISOString()).toBe("2026-11-17T14:00:00.000Z");
    expect(await todosOf(event.id)).toEqual([]);
  });

  it("an event the draft deletes gets nothing else: the answer fails the checks", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await lernblock(alice);
    app.assistant.answerJson({
      kind: "draft",
      text: "Removed.",
      events: [],
      changes: [{ ref: "e1", action: "delete", start: null, end: null }],
      addTodos: [{ ref: "e1", todos: TODOS }],
    });
    expect((await read(await send("Drop it and add the to-dos"))).status).toBe(502);
    expect(await draftsOf(app.db, alice)).toEqual([]);
  });
});

describe("dragging (decision 7)", () => {
  it("the to-dos cannot be dragged, but the draft's other blocks can; the to-dos stay", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const event = await lernblock(alice);
    app.assistant.answerJson({
      kind: "draft",
      text: "Study and to-dos.",
      events: [{ title: "Study", start: "2026-11-17T09:00", end: "2026-11-17T10:00", goalId: null, todos: [] }],
      changes: [],
      addTodos: [{ ref: "e1", todos: TODOS }],
    });
    const sent = await read(await send("Study at 9, and the to-dos for the Lernblock"));
    const draftId = (sent.body.messages as { draft: { id: string } }[])[1].draft.id;

    const moved = await read(await edit(draftId, { kind: "new", index: 0 }, "2026-11-17T10:00", "2026-11-17T11:00"));
    expect(moved.status).toBe(200);
    expect(moved.body.draft).toMatchObject({ version: 1, addedTodos: [{ eventId: event.id, todos: TODOS }] });
    // There is no block for them to drag.
    expect((await read(await edit(draftId, { kind: "move", eventId: event.id }, "2026-11-17T15:00", "2026-11-17T17:00", 1))).status).toBe(404);

    expect((await read(await accept(draftId))).status).toBe(201);
    expect(await todosOf(event.id)).toHaveLength(2);
  });
});
