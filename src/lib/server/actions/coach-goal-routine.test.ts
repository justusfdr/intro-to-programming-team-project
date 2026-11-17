// Spec 43 (R22, R23, R45, A27) with the fake assistant: what Claude receives about a goal's routine
// (never its place), an answer that plans on a never day refused, the check again on accept and on
// dragging, the goal's place on the accepted sessions (all or nothing), and undo.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { chatOf, draftsOf, seedDraft, sentToday } from "@test/support/chat";
import { eventsOf, seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { SYSTEM_PROMPT } from "@/lib/chat/prompt";
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

const PLACE = "Fitness Park, Rua Augusta 12, Porto";
const OUT_OF_DATE = { status: 409, body: { error: "draft_out_of_date", message: "This draft is out of date. Ask again" } };

const send = (text: string) => sendMessage(postJson("/api/chat/messages", { text }), app.deps);
const accept = (id: string) => acceptDraft(postJson(`/api/chat/drafts/${id}/accept`, {}), app.deps, id);
const undo = (id: string) => undoDraft(postJson(`/api/chat/drafts/${id}/undo`, {}), app.deps, id);

/** A gym goal: 3 times a week, 90 minutes, evenings, never on Fridays, at a gym. */
async function seedGym(userId: string, routine: { location?: string | null; avoidDays?: string } = {}) {
  const goal = await seedGoal(app.db, userId, { title: "Gym", deadline: "2027-03-14", rules: [{ kind: "count", target: 3 }] });
  await app.db.admin(
    `update app.goals set category = 'sport', session_minutes = 90, day_part = 'evening', avoid_days = $2, location = $3
      where id = $1`,
    [goal.id, routine.avoidDays ?? "5", routine.location === undefined ? PLACE : routine.location],
  );
  return goal;
}

const gymAnswer = (goalId: string, ...days: string[]) => ({
  kind: "draft",
  text: "Two gym evenings this week.",
  events: days.map((day) => ({ title: "Gym", start: `${day}T18:00`, end: `${day}T19:30`, goalId, todos: [] })),
  changes: [],
  addTodos: [],
});

async function draftFromAnswer(answer: unknown): Promise<string> {
  app.assistant.answerJson(answer);
  const sent = await read(await send("Plan the gym into my week"));
  expect(sent.status).toBe(201);
  return (sent.body.messages as { draft: { id: string } | null }[])[1].draft!.id;
}

const locationsOf = async (userId: string) =>
  app.db.admin<{ title: string; location: string | null; goal_id: string | null }>(
    "select title, location, goal_id from app.events where user_id = $1 order by start_at, id",
    [userId],
  );

describe("what Claude receives (R22 extended)", () => {
  it("A27: the goal's routine and the sessions left, never its place; a goal without a routine as before", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGym(alice);
    const exam = await seedGoal(app.db, alice, { title: "Statistics exam", deadline: "2027-01-20", rules: [{ kind: "hours", target: 6 }] });
    // This week: one gym session done on Monday morning, one planned on Wednesday.
    await seedEvent(app.db, alice, { title: "Gym", start: "2026-11-16T07:00:00Z", end: "2026-11-16T08:30:00Z", goalId: gym.id, status: "done" });
    await seedEvent(app.db, alice, { title: "Gym", start: "2026-11-18T18:00:00Z", end: "2026-11-18T19:30:00Z", goalId: gym.id });

    await send("Plan my week");

    expect(app.assistant.requests[0].system).toBe(SYSTEM_PROMPT);
    const goals = app.assistant.lastData().goals as Record<string, unknown>[];
    expect(goals).toEqual([
      {
        id: gym.id,
        title: "Gym",
        deadline: "2027-03-14",
        rules: [{ kind: "count", target: 3, minMinutes: null }],
        category: "sport",
        sessionMinutes: 90,
        dayPart: "evening",
        never: ["Friday"],
        neverDates: ["2026-11-20", "2026-11-27"],
        away: true,
        weeks: [
          { from: "2026-11-16", to: "2026-11-22", left: 1 },
          { from: "2026-11-23", to: "2026-11-29", left: 3 },
        ],
      },
      { id: exam.id, title: "Statistics exam", deadline: "2027-01-20", rules: [{ kind: "hours", target: 6, minMinutes: null }] },
    ]);
    const text = app.assistant.requests[0].data;
    for (const part of ["Fitness Park", "Rua Augusta", "Porto"]) expect(text, part).not.toContain(part);
  });
});

describe("send_message with a never day (R23 extended)", () => {
  it("A27: an answer on allowed days is saved as an open draft", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGym(alice);
    await draftFromAnswer(gymAnswer(gym.id, "2026-11-18", "2026-11-19"));
    expect((await chatOf(app.db, alice)).map((m) => m.status)).toEqual([null, "open"]);
  });

  it("A27: an answer that plans a session on a never day is refused; nothing saved, nothing counted (spec 44)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGym(alice);
    app.assistant.answerJson(gymAnswer(gym.id, "2026-11-18", "2026-11-20"));

    const answer = await read(await send("Plan the gym into my week"));

    expect(answer).toEqual({ status: 502, body: { error: "answer_failed_checks", message: "The assistant's answer failed our checks. Please try again" } });
    expect(await chatOf(app.db, alice)).toEqual([]);
    expect(await eventsOf(app.db, alice)).toEqual([]);
    // Spec 44: nothing is counted.
    expect(await sentToday(app.db, alice)).toBe(0);
  });
});

describe("accept_draft with a goal's routine", () => {
  it("the created sessions of a goal with a place carry it; other events get none", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGym(alice);
    const answer = gymAnswer(gym.id, "2026-11-18");
    answer.events.push({ title: "Call", start: "2026-11-18T12:00", end: "2026-11-18T12:30", goalId: null as unknown as string, todos: [] });
    const draftId = await draftFromAnswer(answer);

    const accepted = await read(await accept(draftId));

    expect(accepted.status).toBe(201);
    expect(accepted.body.events).toMatchObject([
      { title: "Call", location: null },
      { title: "Gym", location: PLACE },
    ]);
    expect(await locationsOf(alice)).toEqual([
      { title: "Call", location: null, goal_id: null },
      { title: "Gym", location: PLACE, goal_id: gym.id },
    ]);
  });

  it("the sessions of a goal without a place get no location", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGym(alice, { location: null });
    const draftId = await draftFromAnswer(gymAnswer(gym.id, "2026-11-18"));
    expect((await read(await accept(draftId))).status).toBe(201);
    expect(await locationsOf(alice)).toEqual([{ title: "Gym", location: null, goal_id: gym.id }]);
  });

  it("an event the draft moves keeps its own location", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGym(alice);
    const own = await seedEvent(app.db, alice, { title: "Gym", start: "2026-11-17T18:00:00Z", end: "2026-11-17T19:30:00Z", goalId: gym.id });
    const moved = await app.db.admin<{ updated_at: Date }>("update app.events set location = 'Beach' where id = $1 returning updated_at", [own.id]);
    const { draftId } = await seedDraft(app.db, alice, [], "open", [
      {
        kind: "move",
        event: { id: own.id, updatedAt: new Date(moved[0].updated_at).toISOString() },
        title: "Gym",
        oldStart: "2026-11-17T18:00:00.000Z",
        oldEnd: "2026-11-17T19:30:00.000Z",
        start: "2026-11-18T18:00:00.000Z",
        end: "2026-11-18T19:30:00.000Z",
      },
    ]);
    expect((await read(await accept(draftId))).status).toBe(201);
    expect(await locationsOf(alice)).toEqual([{ title: "Gym", location: "Beach", goal_id: gym.id }]);
  });

  it("all or nothing: if writing the place fails, no event is left behind and the draft stays open", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGym(alice);
    const draftId = await draftFromAnswer(gymAnswer(gym.id, "2026-11-18", "2026-11-19"));
    const before = await app.snapshot();
    // The database refuses the place function for this one request.
    await app.db.admin("revoke execute on function app.chat_place_created_events(uuid) from authenticated");
    try {
      const answer = await read(await accept(draftId));
      expect(answer.status).toBe(500);
    } finally {
      await app.db.admin("grant execute on function app.chat_place_created_events(uuid) to authenticated");
    }
    expect(await eventsOf(app.db, alice)).toEqual([]);
    expect((await draftsOf(app.db, alice)).map((d) => d.status)).toEqual(["open"]);
    expect(await app.snapshot()).toEqual(before);
    // And it can still be accepted afterwards.
    expect((await read(await accept(draftId))).status).toBe(201);
  });

  it("all or nothing, a failure inside the same transaction after the place was written: nothing applied", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGym(alice);
    const draftId = await draftFromAnswer(gymAnswer(gym.id, "2026-11-18"));
    const before = await app.snapshot();
    // The statement after the place fails (as if the connection broke there).
    const failing = {
      ...app.deps,
      withUser: <R>(userId: string, fn: Parameters<typeof app.deps.withUser>[1]) =>
        app.deps.withUser(userId, (query) =>
          fn(async (sql, params) => {
            if (sql.includes("from app.events where id = any")) throw new Error("connection lost");
            return query(sql, params);
          }),
        ) as Promise<R>,
    };
    const answer = await read(await acceptDraft(postJson(`/api/chat/drafts/${draftId}/accept`, {}), failing, draftId));
    expect(answer.status).toBe(500);
    expect(await app.snapshot()).toEqual(before);
  });

  it("undo removes the created sessions with their place, as for any accepted draft", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGym(alice);
    const draftId = await draftFromAnswer(gymAnswer(gym.id, "2026-11-18", "2026-11-19"));
    expect((await read(await accept(draftId))).status).toBe(201);
    expect((await locationsOf(alice)).map((e) => e.location)).toEqual([PLACE, PLACE]);

    expect((await read(await undo(draftId))).status).toBe(200);
    expect(await eventsOf(app.db, alice)).toEqual([]);
    expect((await draftsOf(app.db, alice)).map((d) => d.status)).toEqual(["undone"]);
  });

  it("undo is still refused for a session the person changed after accepting", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGym(alice);
    const draftId = await draftFromAnswer(gymAnswer(gym.id, "2026-11-18"));
    expect((await read(await accept(draftId))).status).toBe(201);
    await app.db.admin("update app.events set title = 'Gym with Lea' where user_id = $1", [alice]);
    expect((await read(await undo(draftId))).status).toBe(409);
    // Calling the place function again changes nothing and does not make undo possible.
    await app.db.withUser(alice, (query) => query("select app.chat_place_created_events($1::uuid)", [draftId]));
    expect((await read(await undo(draftId))).status).toBe(409);
  });

  it("the place function: another user's draft is 'Not found', an open draft is refused", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const bob = await app.db.createUser("bob@example.com");
    const { draftId } = await seedDraft(app.db, alice, [{ title: "Gym", start: "2026-11-18T18:00:00.000Z", end: "2026-11-18T19:30:00.000Z" }]);
    await expect(app.db.withUser(bob, (query) => query("select app.chat_place_created_events($1::uuid)", [draftId]))).rejects.toThrow(/Not found/);
    await expect(app.db.withUser(alice, (query) => query("select app.chat_place_created_events($1::uuid)", [draftId]))).rejects.toThrow(
      /not applied/,
    );
  });

  it("A27: accepting after the goal's days changed is 'out of date' and changes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGym(alice);
    const draftId = await draftFromAnswer(gymAnswer(gym.id, "2026-11-18", "2026-11-19"));
    // Now the gym is never on Thursdays.
    await app.db.admin("update app.goals set avoid_days = '4' where id = $1", [gym.id]);
    const before = await app.snapshot();

    expect(await read(await accept(draftId))).toEqual(OUT_OF_DATE);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("edit_draft with a never day", () => {
  it("dragging a block is checked against the goal's days as they are now", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGym(alice);
    const draftId = await draftFromAnswer(gymAnswer(gym.id, "2026-11-19"));
    const drag = () =>
      editDraft(
        postJson(`/api/chat/drafts/${draftId}/edit`, { version: 0, item: { kind: "new", index: 0 }, start: "2026-11-19T19:00", end: "2026-11-19T20:30" }),
        app.deps,
        draftId,
      );
    await app.db.admin("update app.goals set avoid_days = '4' where id = $1", [gym.id]);
    const before = await app.snapshot();
    expect(await read(await drag())).toEqual(OUT_OF_DATE);
    expect(await app.snapshot()).toEqual(before);

    await app.db.admin("update app.goals set avoid_days = '5' where id = $1", [gym.id]);
    expect((await read(await drag())).status).toBe(200);
  });
});

describe("A27 as the ontology tells it", () => {
  it("the data block, an accepted session with the goal's place, undo; then an answer on a Friday refused", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGoal(app.db, alice, { title: "Gym", deadline: "2027-03-14", rules: [{ kind: "count", target: 3 }] });
    await app.db.admin(
      "update app.goals set category = 'sport', session_minutes = 90, day_part = 'evening', avoid_days = '5', location = 'Fitness Park, Rua Augusta 12' where id = $1",
      [gym.id],
    );
    await seedEvent(app.db, alice, { title: "Gym", start: "2026-11-16T07:00:00Z", end: "2026-11-16T08:30:00Z", goalId: gym.id, status: "done" });
    await seedEvent(app.db, alice, { title: "Gym", start: "2026-11-17T18:00:00Z", end: "2026-11-17T19:30:00Z", goalId: gym.id });

    const draftId = await draftFromAnswer(gymAnswer(gym.id, "2026-11-19"));
    const [goal] = app.assistant.lastData().goals as Record<string, unknown>[];
    expect(goal).toMatchObject({
      category: "sport",
      sessionMinutes: 90,
      dayPart: "evening",
      never: ["Friday"],
      neverDates: ["2026-11-20", "2026-11-27"],
      away: true,
      weeks: [
        { from: "2026-11-16", to: "2026-11-22", left: 1 },
        { from: "2026-11-23", to: "2026-11-29", left: 3 },
      ],
    });
    expect(app.assistant.requests[0].data).not.toMatch(/Fitness Park|Rua Augusta/);

    expect((await read(await accept(draftId))).status).toBe(201);
    const created = await app.db.admin<{ location: string | null }>(
      "select location from app.events where user_id = $1 and source = 'assistant'",
      [alice],
    );
    expect(created).toEqual([{ location: "Fitness Park, Rua Augusta 12" }]);
    expect((await read(await undo(draftId))).status).toBe(200);
    expect(await app.db.admin("select 1 from app.events where user_id = $1 and source = 'assistant'", [alice])).toEqual([]);

    app.assistant.answerJson(gymAnswer(gym.id, "2026-11-20"));
    const refused = await read(await send("Plan the gym into my week"));
    expect(refused.body.message).toBe("The assistant's answer failed our checks. Please try again");
    // Spec 44: nothing is counted.
    expect(await sentToday(app.db, alice)).toBe(0);
    expect((await chatOf(app.db, alice)).length).toBe(2);
  });
});
