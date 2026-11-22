// Spec 21 on the coach's server side, with the fake assistant and the temporary database: the owner's
// sentence "Tomorrow I want to study from 12 to 1, and there I have the to-dos …" becomes a draft whose
// event carries the to-dos; the draft keeps them and sends them back with the history ("add one more");
// accepting creates the events with their to-dos in one step; undo removes them with their events; an
// event the coach deleted comes back with its to-dos. A failed check of a to-do rejects the answer (R23).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { draftsOf } from "@test/support/chat";
import { seedEvent } from "@test/support/events";
import { loadChatPage } from "@/lib/server/pages/load";
import { acceptDraft } from "./accept-draft";
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

const STUDY = { title: "Study", start: "2026-11-17T12:00", end: "2026-11-17T13:00", goalId: null };
const todosOfAll = () =>
  app.db.admin<{ event: string; title: string; done: boolean }>(
    "select e.title as event, t.title, t.done from app.event_todos t join app.events e on e.id = t.event_id order by e.start_at, t.position",
  );

describe("the coach writes the to-dos down", () => {
  it("keeps the to-dos in the draft, sends them back with the history, and creates them with the event on accept", async () => {
    const alice = await app.signedInAs("alice@example.com");
    app.assistant.answerJson({
      kind: "draft",
      text: "Here is Tuesday.",
      events: [{ ...STUDY, todos: ["Read chapter 3", "Exercises 1-4"] }],
      changes: [],
    });
    const first = await read(await send("Tomorrow I want to study from 12 to 1, and there I have to read chapter 3 and do exercises 1-4"));
    expect(first.status).toBe(201);
    const messages = first.body.messages as { draft: { id: string; events: unknown[] } | null }[];
    expect(messages[1].draft!.events).toEqual([
      { title: "Study", startAt: "2026-11-17T12:00:00.000Z", endAt: "2026-11-17T13:00:00.000Z", goalId: null, todos: ["Read chapter 3", "Exercises 1-4"] },
    ]);

    // "Add one more": Claude sees the draft's to-dos and answers with the whole list again.
    app.assistant.answerJson({
      kind: "draft",
      text: "Added the summary.",
      events: [{ ...STUDY, todos: ["Read chapter 3", "Exercises 1-4", "Write a summary"] }],
      changes: [],
    });
    const second = await read(await send("Add one more: write a summary"));
    const history = app.assistant.lastData().history as { proposedEvents?: { todos?: string[] }[] }[];
    expect(history[1].proposedEvents![0].todos).toEqual(["Read chapter 3", "Exercises 1-4"]);
    const draftId = (second.body.messages as { draft: { id: string } }[])[1].draft.id;

    // The page shows them.
    const page = await loadChatPage(app.deps, alice);
    expect(page.messages[3].draft!.events[0].todos).toEqual(["Read chapter 3", "Exercises 1-4", "Write a summary"]);

    const accepted = await read(await accept(draftId));
    expect(accepted.status).toBe(201);
    expect(accepted.body.events).toMatchObject([{ title: "Study", source: "assistant", todoCount: 3, todosDone: 0 }]);
    expect(await todosOfAll()).toEqual([
      { event: "Study", title: "Read chapter 3", done: false },
      { event: "Study", title: "Exercises 1-4", done: false },
      { event: "Study", title: "Write a summary", done: false },
    ]);

    // Undo removes the event with its to-dos, even a ticked one.
    await app.db.admin("update app.event_todos set done = true where title = 'Read chapter 3'");
    expect((await read(await undo(draftId))).status).toBe(200);
    expect(await app.db.admin("select * from app.events")).toEqual([]);
    expect(await todosOfAll()).toEqual([]);
  });

  it("the calendar's own events are sent without their to-dos (R22)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const lecture = await seedEvent(app.db, alice, { title: "Lecture", start: "2026-11-17T14:00:00Z", end: "2026-11-17T15:00:00Z" });
    await app.db.admin("insert into app.event_todos (user_id, event_id, title, position) values ($1, $2, 'Private note', 0)", [alice, lecture.id]);
    await send("What do I have tomorrow?");
    expect(app.assistant.requests[0].data).not.toContain("Private note");
    expect(JSON.stringify(app.assistant.lastData().events)).not.toContain("todos");
  });

  it("an event with 21 to-dos or an empty one is left out and named: nothing planned (A6's rule, spec 67)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const cases: [string[], string][] = [
      [Array.from({ length: 21 }, (_, i) => `To-do ${i}`), "an event has at most 20 to-dos"],
      [["Fine", ""], "a to-do is empty or too long"],
    ];
    for (const [todos, reason] of cases) {
      app.assistant.answerJson({ kind: "draft", text: "Here.", events: [{ ...STUDY, todos }], changes: [] });
      const answer = await read(await send("Plan tomorrow"));
      expect(answer.status, reason).toBe(201);
      const [, reply] = answer.body.messages as { text: string; draft: unknown }[];
      expect(reply.draft, reason).toBeNull();
      expect(reply.text, reason).toContain("None of this could go into a plan:");
      expect(reply.text, reason).toContain("• Study, Tue, Nov 17,");
      expect(reply.text, reason).toContain(`${reason}.`);
    }
    expect(await draftsOf(app.db, alice)).toEqual([]);
    expect(await todosOfAll()).toEqual([]);
  });

  it("an event the coach deletes comes back on undo with its to-dos", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedEvent(app.db, alice, { title: "Gym", start: "2026-11-17T17:00:00Z", end: "2026-11-17T18:00:00Z" });
    await app.db.admin(
      "insert into app.event_todos (user_id, event_id, title, done, position) values ($1, $2, 'Warm up', true, 0), ($1, $2, 'Squats', false, 1)",
      [alice, gym.id],
    );
    app.assistant.answerJson({ kind: "draft", text: "Dropped the gym.", events: [], changes: [{ ref: "e1", action: "delete", start: null, end: null }] });
    const sent = await read(await send("Drop the gym tomorrow"));
    const draftId = (sent.body.messages as { draft: { id: string } }[])[1].draft.id;
    await accept(draftId);
    expect(await todosOfAll()).toEqual([]);
    expect((await read(await undo(draftId))).status).toBe(200);
    expect(await todosOfAll()).toEqual([
      { event: "Gym", title: "Warm up", done: true },
      { event: "Gym", title: "Squats", done: false },
    ]);
  });
});
