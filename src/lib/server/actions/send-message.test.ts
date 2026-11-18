// Tests for send_message (spec 19; ontology section 5, R1, R3, R5, R21 to R23, R31, A4, A5, A6, A11),
// with the fake assistant: what is saved, what Claude receives, the Pro switch both ways, and every way
// it can fail (nothing saved, the calendar unchanged). Spec 44: there is no daily limit any more and
// nothing is counted; the tests that pinned the limit now pin that it is gone.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { A5_ANSWER, chatOf, draftsOf, seedDraft, A5_PROPOSALS, sentToday, setPlan, setSentToday } from "@test/support/chat";
import { eventsOf, seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { seedTask } from "@test/support/tasks";
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
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const A5_TEXT = "Tomorrow I want to study from 8 to 1, a short call at 13:30, sport in the evening and an event at night";

function send(body: unknown, deps = app.deps, headers?: Record<string, string>) {
  return sendMessage(postJson("/api/chat/messages", body, headers), deps);
}

/** Everything but the day counter, to prove nothing else changed. */
async function snapshotWithoutCount() {
  const snap = await app.snapshot();
  const tables = snap.tables as Record<string, Record<string, unknown>[]>;
  for (const row of tables.profiles) {
    delete row.chat_count;
    delete row.chat_count_date;
  }
  return snap;
}

describe("send_message accepted", () => {
  it("A5: saves both messages and an open draft with 4 proposals; the calendar is unchanged", async () => {
    const alice = await app.signedInAs("alice@example.com");
    app.assistant.answerJson(A5_ANSWER);

    const answer = await read(await send({ text: A5_TEXT }));

    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({
      messages: [
        { role: "user", text: A5_TEXT, draft: null },
        {
          role: "assistant",
          text: "Here is your Tuesday.",
          draft: {
            status: "open",
            events: [
              { title: "Study", startAt: "2026-11-17T08:00:00.000Z", endAt: "2026-11-17T13:00:00.000Z", goalId: null },
              { title: "Call", startAt: "2026-11-17T13:30:00.000Z", endAt: "2026-11-17T14:00:00.000Z", goalId: null },
              { title: "Sport", startAt: "2026-11-17T18:00:00.000Z", endAt: "2026-11-17T19:30:00.000Z", goalId: null },
              { title: "Event", startAt: "2026-11-17T20:00:00.000Z", endAt: "2026-11-17T21:00:00.000Z", goalId: null },
            ],
          },
        },
      ],
    });
    expect((await chatOf(app.db, alice)).map((m) => [m.role, m.status])).toEqual([
      ["user", null],
      ["assistant", "open"],
    ]);
    expect(await eventsOf(app.db, alice)).toEqual([]);
    // Spec 44: nothing is counted.
    expect(await sentToday(app.db, alice)).toBe(0);
  });

  it("saves a text answer without a draft; nothing else changes", async () => {
    const alice = await app.signedInAs("alice@example.com");
    app.assistant.answerJson({ kind: "text", text: "Gern! Was steht morgen an?", events: [] });

    const answer = await read(await send({ text: "  Hallo  " }));

    expect(answer.status).toBe(201);
    expect(await chatOf(app.db, alice)).toEqual([
      { role: "user", text: "Hallo", status: null, proposed_events: null },
      { role: "assistant", text: "Gern! Was steht morgen an?", status: null, proposed_events: null },
    ]);
  });

  it("a new draft turns the older open draft 'replaced'; a text answer leaves it open", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const old = await seedDraft(app.db, alice, A5_PROPOSALS);

    app.assistant.answerJson({ kind: "text", text: "Sure.", events: [] });
    expect((await send({ text: "Thanks" })).status).toBe(201);
    expect((await draftsOf(app.db, alice)).map((d) => d.status)).toEqual(["open"]);

    app.assistant.answerJson({ ...A5_ANSWER, events: A5_ANSWER.events.slice(0, 2) });
    expect((await send({ text: "Swap the sport and the event" })).status).toBe(201);
    const drafts = await draftsOf(app.db, alice);
    expect(drafts.find((d) => d.id === old.draftId)?.status).toBe("replaced");
    expect(drafts.filter((d) => d.status === "open")).toHaveLength(1);
  });

  it("accepts a proposal with the user's own goal", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { title: "Statistics exam", deadline: "2027-01-20", rules: [{ kind: "hours", target: 6 }] });
    app.assistant.answerJson({ ...A5_ANSWER, events: [{ ...A5_ANSWER.events[0], goalId: goal.id }] });
    const answer = await read(await send({ text: "Study tomorrow" }));
    expect(answer.status).toBe(201);
    expect((await chatOf(app.db, alice))[1].proposed_events).toEqual([
      { title: "Study", start_at: "2026-11-17T08:00:00.000Z", end_at: "2026-11-17T13:00:00.000Z", goal_id: goal.id },
    ]);
  });

  it("spec 44: no daily limit: a message after 20 today is answered, and nothing is counted", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setSentToday(app.db, alice, 20);
    const answer = await read(await send({ text: "One more" }));
    expect(answer.status).toBe(201);
    expect(answer.body).not.toHaveProperty("messagesLeft");
    expect(await sentToday(app.db, alice)).toBe(20);
  });
});

describe("what Claude receives (R22, R31)", () => {
  it("the fixed system prompt, the answer schema and one JSON block with the user's data only", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { title: "Statistics exam", deadline: "2027-01-20", rules: [{ kind: "hours", target: 6 }] });
    await seedEvent(app.db, alice, { title: "Lecture", start: "2026-11-17T10:00:00Z", end: "2026-11-17T12:00:00Z", goalId: goal.id });
    await app.db.admin("update app.events set location = 'Rua Augusta 1, Lisbon' where title = 'Lecture'");
    await seedTask(app.db, alice, { title: "Buy running shoes" });
    await app.db.admin("insert into app.blocked_sites (user_id, domain) values ($1, 'secret-site.example')", [alice]);
    await app.db.admin("update app.settings set home_address = 'Home street 5', day_start_hour = 8, day_end_hour = 22 where user_id = $1", [alice]);

    await send({ text: "Plan tomorrow" });

    const request = app.assistant.requests[0];
    expect(request.system).toContain("You are the coach in LockedIn");
    expect(request.schema).toHaveProperty("properties.events");
    const data = app.assistant.lastData();
    expect(data).toMatchObject({
      now: "2026-11-16T09:00",
      timeZone: "Europe/Lisbon",
      dayStartHour: 8,
      dayEndHour: 22,
      goals: [{ id: goal.id, title: "Statistics exam", deadline: "2027-01-20" }],
      events: [{ title: "Lecture", allDay: false, start: "2026-11-17T10:00", end: "2026-11-17T12:00", mayOverlap: false }],
      history: [],
      message: "Plan tomorrow",
    });
    const text = request.data;
    for (const secret of ["alice@example.com", "Rua Augusta", "Home street", "Buy running shoes", "secret-site", "test-password", alice]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it("sends the last 10 messages, an assistant message with its draft's events, so 'swap the two' works", async () => {
    const alice = await app.signedInAs("alice@example.com");
    for (let i = 0; i < 6; i++) await app.db.admin("insert into app.chat_messages (user_id, role, text) values ($1, 'user', $2)", [alice, `old ${i}`]);
    await seedDraft(app.db, alice, A5_PROPOSALS);

    await send({ text: "Swap the sport and the event" });

    const history = app.assistant.lastData().history as Record<string, unknown>[];
    expect(history).toHaveLength(8);
    expect(history[7]).toEqual({
      role: "assistant",
      text: "Here is your day.",
      draftStatus: "open",
      proposedEvents: [
        { title: "Study", start: "2026-11-17T08:00", end: "2026-11-17T13:00", goalId: null },
        { title: "Call", start: "2026-11-17T13:30", end: "2026-11-17T14:00", goalId: null },
        { title: "Sport", start: "2026-11-17T18:00", end: "2026-11-17T19:30", goalId: null },
        { title: "Event", start: "2026-11-17T20:00", end: "2026-11-17T21:00", goalId: null },
      ],
    });

    for (let i = 0; i < 6; i++) await app.db.admin("insert into app.chat_messages (user_id, role, text) values ($1, 'user', $2)", [alice, `new ${i}`]);
    await send({ text: "And now?" });
    const later = app.assistant.lastData().history as { text: string }[];
    expect(later).toHaveLength(10);
    expect(later[9].text).toBe("new 5");
  });

  it("A11: totals only — 'Half marathon' 150 minutes last week, 100 the week before; no draft, nothing changed", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { title: "Half marathon", deadline: "2027-03-14", rules: [{ kind: "hours", target: 3 }] });
    await seedEvent(app.db, alice, { title: "Long run", start: "2026-11-10T07:00:00Z", end: "2026-11-10T08:30:00Z", goalId: goal.id, status: "done" });
    await seedEvent(app.db, alice, { title: "Run", start: "2026-11-13T07:00:00Z", end: "2026-11-13T08:00:00Z", goalId: goal.id, status: "done" });
    await seedEvent(app.db, alice, { title: "Run", start: "2026-11-04T07:00:00Z", end: "2026-11-04T08:40:00Z", goalId: goal.id, status: "done" });
    // Planned, not done: does not count.
    await seedEvent(app.db, alice, { title: "Run", start: "2026-11-05T07:00:00Z", end: "2026-11-05T08:00:00Z", goalId: goal.id });
    const events = await eventsOf(app.db, alice);
    app.assistant.answerJson({ kind: "text", text: "Last week 150 minutes, the week before 100 minutes.", events: [] });

    const answer = await read(await send({ text: "How much time did I spend on sport in the last weeks?" }));

    expect(answer.status).toBe(201);
    const data = app.assistant.lastData();
    const weeks = (data.totals as { weeks: { monday: string; goals: { goal: string; doneMinutes: number }[] }[] }).weeks;
    expect(weeks.find((w) => w.monday === "2026-11-09")?.goals).toEqual([
      { goalId: goal.id, goal: "Half marathon", doneMinutes: 150, focusedMinutes: 0 },
    ]);
    expect(weeks.find((w) => w.monday === "2026-11-02")?.goals).toEqual([
      { goalId: goal.id, goal: "Half marathon", doneMinutes: 100, focusedMinutes: 0 },
    ]);
    // No single past events are sent.
    expect(data.events).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("Long run");
    expect((await chatOf(app.db, alice)).map((m) => m.status)).toEqual([null, null]);
    expect(await eventsOf(app.db, alice)).toEqual(events);
  });

  it("counts focused minutes of finished sessions for their event's goal", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { title: "Statistics exam", deadline: "2027-01-20", rules: [{ kind: "hours", target: 6 }] });
    const event = await seedEvent(app.db, alice, { start: "2026-11-12T09:00:00Z", end: "2026-11-12T11:00:00Z", goalId: goal.id });
    await app.db.admin(
      `insert into app.focus_sessions (user_id, event_id, planned_minutes, status, started_at, ended_at)
       values ($1, $2, 60, 'finished', '2026-11-12T09:00:00Z', '2026-11-12T09:50:00Z')`,
      [alice, event.id],
    );
    await send({ text: "How focused was I?" });
    const weeks = (app.assistant.lastData().totals as { weeks: { monday: string; goals: unknown[] }[] }).weeks;
    expect(weeks.find((w) => w.monday === "2026-11-09")?.goals).toEqual([
      { goalId: goal.id, goal: "Statistics exam", doneMinutes: 0, focusedMinutes: 50 },
    ]);
  });
});

describe("send_message rejected", () => {
  it("A6: a wrong answer fails the checks and saves nothing; spec 44: the next message is asked again", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setSentToday(app.db, alice, 19);
    const before = await app.snapshot();
    app.assistant.answerJson({ ...A5_ANSWER, events: [{ title: "Call", start: "2026-11-17T13:30", end: "2026-11-17T13:00", goalId: null }] });

    expect(await read(await send({ text: A5_TEXT }))).toEqual({
      status: 502,
      body: { error: "answer_failed_checks", message: "The assistant's answer failed our checks. Please try again" },
    });
    expect(await chatOf(app.db, alice)).toEqual([]);
    expect(await app.snapshot()).toEqual(before);

    expect((await send({ text: A5_TEXT })).status).toBe(201);
    expect(app.assistant.requests).toHaveLength(2);
    expect(await sentToday(app.db, alice)).toBe(19);
  });

  it.each([
    ["a refusal", { kind: "failed", reason: "refusal" } as const],
    ["an answer cut off", { kind: "failed", reason: "max_tokens" } as const],
    ["an answer that is not JSON", { kind: "failed", reason: "not_json" } as const],
    ["a proposal for another user's goal", { kind: "answer", value: { ...A5_ANSWER, events: [{ ...A5_ANSWER.events[0], goalId: "00000000-0000-4000-8000-000000000000" }] } } as const],
    ["an all-day proposal", { kind: "answer", value: { ...A5_ANSWER, events: [{ title: "Exam", start: "2026-11-17", end: "2026-11-18", goalId: null }] } } as const],
    ["a proposal over an event that may not overlap", { kind: "answer", value: A5_ANSWER } as const],
  ])("%s: 'failed our checks', nothing saved, nothing counted (spec 44)", async (_case, result) => {
    const alice = await app.signedInAs("alice@example.com");
    await seedEvent(app.db, alice, { title: "Gym", start: "2026-11-17T18:30:00Z", end: "2026-11-17T19:00:00Z" });
    const before = await snapshotWithoutCount();
    app.assistant.answer(result);

    const answer = await read(await send({ text: A5_TEXT }));

    expect(answer.body.message).toBe("The assistant's answer failed our checks. Please try again");
    expect(await snapshotWithoutCount()).toEqual(before);
    expect(await sentToday(app.db, alice)).toBe(0);
  });

  it("Claude down: 'not available', nothing saved, the calendar and the open draft unchanged, nothing counted (spec 44)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedDraft(app.db, alice, A5_PROPOSALS);
    const before = await snapshotWithoutCount();
    app.assistant.answer({ kind: "unavailable", reason: "server_error" });

    expect(await read(await send({ text: A5_TEXT }))).toEqual({
      status: 503,
      body: { error: "assistant_unavailable", message: "The assistant is not available right now. Your calendar is unchanged" },
    });
    expect(await snapshotWithoutCount()).toEqual(before);
    expect(await sentToday(app.db, alice)).toBe(0);
  });

  it("no key on this server: 'not available', Claude not called, nothing changed, not counted", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect((await read(await send({ text: A5_TEXT }, { ...app.deps, assistant: null }))).body.message).toBe(
      "The assistant is not available right now. Your calendar is unchanged",
    );
    expect(await app.snapshot()).toEqual(before);
  });

  it("spec 44: at 20 messages today Claude is still asked and the turn is saved", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setSentToday(app.db, alice, 20);
    expect((await send({ text: "Hi" })).status).toBe(201);
    expect(app.assistant.requests).toHaveLength(1);
    expect((await chatOf(app.db, alice)).map((m) => m.text)).toEqual(["Hi", "Okay."]);
  });

  it("two messages at the same moment: both are answered and saved (spec 44: no limit)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setSentToday(app.db, alice, 19);
    const answers = await Promise.all((await Promise.all([send({ text: "First" }), send({ text: "Second" })])).map(read));
    expect(answers.map((a) => a.status)).toEqual([201, 201]);
    expect(await sentToday(app.db, alice)).toBe(19);
    expect(app.assistant.requests).toHaveLength(2);
    expect(await chatOf(app.db, alice)).toHaveLength(4);
  });

  it.each([
    ["an empty text", ""],
    ["only spaces", "   "],
    ["4,001 characters", "x".repeat(4001)],
  ])("rejects %s: 'A message must be 1 to 4,000 characters', not counted", async (_case, text) => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await send({ text }))).toEqual({ status: 400, body: { error: "text_length", message: "A message must be 1 to 4,000 characters" } });
    expect(app.assistant.requests).toEqual([]);
    expect(await app.snapshot()).toEqual(before);
  });

  it("accepts 4,000 characters", async () => {
    await app.signedInAs("alice@example.com");
    expect((await send({ text: "ü".repeat(4000) })).status).toBe(201);
  });

  it("rejects bodies of the wrong shape with 400 and a body over the size limit with 413", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    for (const body of [{}, { text: 5 }, { text: null }, "not json"]) {
      expect((await send(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await send({ text: "x".repeat(40_000) })).status).toBe(413);
    expect(app.assistant.requests).toEqual([]);
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 401 without a session and 403 from another site; Claude not called, nothing saved", async () => {
    const before = await app.snapshot();
    expect(await read(await send({ text: "Hi" }))).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);

    await app.signedInAs("alice@example.com");
    const signedIn = await app.snapshot();
    expect((await send({ text: "Hi" }, app.deps, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(app.assistant.requests).toEqual([]);
    expect(await app.snapshot()).toEqual(signedIn);
  });
});

describe("who may use the coach (R21, R5, CHAT_PRO_ONLY)", () => {
  it("with Pro only off (the default), a Free user may use it", async () => {
    await app.signedInAs("alice@example.com");
    expect((await send({ text: "Hi" })).status).toBe(201);
  });

  it("A4 with Pro only on: a Free user gets 'The AI chat is part of Pro'; Claude not called; nothing saved", async () => {
    vi.stubEnv("CHAT_PRO_ONLY", "true");
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await send({ text: "Hi" }))).toEqual({ status: 403, body: { error: "pro_only", message: "The AI chat is part of Pro" } });
    expect(app.assistant.requests).toEqual([]);
    expect(await app.snapshot()).toEqual(before);
  });

  it("with Pro only on, a Pro user may use it", async () => {
    vi.stubEnv("CHAT_PRO_ONLY", "true");
    const bob = await app.signedInAs("bob@example.com");
    await setPlan(app.db, bob, "pro");
    expect((await send({ text: "Hi" })).status).toBe(201);
  });

  it("names the first problem in the ontology's order: Pro before the text (spec 44: no limit in between)", async () => {
    vi.stubEnv("CHAT_PRO_ONLY", "true");
    const alice = await app.signedInAs("alice@example.com");
    await setSentToday(app.db, alice, 20);
    expect((await read(await send({ text: "" }))).body.message).toBe("The AI chat is part of Pro");
    await setPlan(app.db, alice, "pro");
    expect((await read(await send({ text: "" }))).body.message).toBe("A message must be 1 to 4,000 characters");
  });
});
