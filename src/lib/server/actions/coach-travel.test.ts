// Issue #227 with the fake assistant and the fake routing: the coach counts the way to an event as busy
// time (what it receives, an answer that falls into it is refused), and a session at a goal's place needs
// room for the way from the event before and on to the one after.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { FakeRouting } from "@/lib/server/routing/fake";
import { sendMessage } from "./send-message";

let app: TestApp;
let routing: FakeRouting;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // Monday 16 November 2026, 09:00 UTC (09:00 in Lisbon)
  routing = new FakeRouting();
  routing.places.set("rua das madres 66, lisboa", { lat: 38.7087, lon: -9.1551 });
  routing.places.set("nova sbe, carcavelos", { lat: 38.6797, lon: -9.3197 });
  routing.places.set("fitness park, rua augusta 12, porto", { lat: 41.15, lon: -8.61 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const GYM = "Fitness Park, Rua Augusta 12, Porto";
const ON_THE_WAY = "it falls in the time you need to get to another event";
const NO_ROOM = "it leaves no time to get there or back";

/** The answer was saved (201) as a text answer: nothing planned, and the note names `title` with `reason` (spec 67). */
async function expectLeftOut(res: Response, title: string, reason: string) {
  const answer = await read(res);
  expect(answer.status).toBe(201);
  const [, reply] = answer.body.messages as { text: string; draft: unknown }[];
  expect(reply.draft).toBeNull();
  expect(reply.text).toContain("None of this could go into a plan:");
  expect(reply.text).toContain(`• ${title}, Tue, Nov 17,`);
  expect(reply.text).toContain(`${reason}.`);
}

const send = () => sendMessage(postJson("/api/chat/messages", { text: "Plan my Tuesday" }), app.deps, routing);

/** Alice with a home address, driving, a 10 minute buffer: 25 + 10 = 35 minutes for any way by car. */
async function alice() {
  const id = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
  await app.db.admin("update app.settings set home_address = 'Rua das Madres 66, Lisboa', travel_mode = 'driving', travel_buffer_minutes = 10 where user_id = $1", [id]);
  return id;
}

/** A lecture on Tuesday 17 November at a place, from `start` to `end` UTC (Lisbon is UTC in winter). */
async function lecture(user: string, start: string, end: string, location = "Nova SBE, Carcavelos") {
  const { id } = await seedEvent(app.db, user, { title: "Lecture", start: `2026-11-17T${start}:00Z`, end: `2026-11-17T${end}:00Z` });
  await app.db.admin("update app.events set location = $2 where id = $1", [id, location]);
  return id;
}

async function gym(user: string) {
  const goal = await seedGoal(app.db, user, { title: "Gym", deadline: "2027-03-14", rules: [{ kind: "count", target: 3 }] });
  await app.db.admin("update app.goals set category = 'sport', session_minutes = 90, location = $2 where id = $1", [goal.id, GYM]);
  return goal.id;
}

const study = (start: string, end: string, goalId: string | null = null, title = "Study") => ({
  kind: "draft",
  text: "Here is your Tuesday.",
  events: [{ title, start: `2026-11-17T${start}`, end: `2026-11-17T${end}`, goalId, todos: [] }],
  changes: [],
  addTodos: [],
});

describe("what Claude receives about the way (issue 227)", () => {
  it("an event at a place carries when to leave, never the place; a goal at a place carries the way from home", async () => {
    const user = await alice();
    await lecture(user, "10:00", "11:00");
    const goal = await gym(user);
    app.assistant.answerJson({ kind: "text", text: "Fine.", events: [], changes: [], addTodos: [] });

    await send();

    const data = app.assistant.lastData();
    const events = data.events as { title: string; leaveBy?: string }[];
    expect(events.find((e) => e.title === "Lecture")?.leaveBy).toBe("2026-11-17T09:25");
    const goals = data.goals as { id: string; away?: boolean; travelMinutes?: number }[];
    expect(goals.find((g) => g.id === goal)).toMatchObject({ away: true, travelMinutes: 35 });
    const text = app.assistant.requests[0].data;
    for (const part of ["Nova SBE", "Carcavelos", "Fitness Park", "Rua Augusta", "Madres"]) expect(text, part).not.toContain(part);
  });

  it("one question per route: three events at the same place ask the routing for it once", async () => {
    const user = await alice();
    await lecture(user, "10:00", "11:00");
    await seedEvent(app.db, user, { title: "Seminar", start: "2026-11-18T14:00:00Z", end: "2026-11-18T15:00:00Z" });
    await app.db.admin("update app.events set location = 'Nova SBE, Carcavelos' where title = 'Seminar'");
    await seedEvent(app.db, user, { title: "Lab", start: "2026-11-19T14:00:00Z", end: "2026-11-19T15:00:00Z" });
    await app.db.admin("update app.events set location = 'Nova SBE, Carcavelos' where title = 'Lab'");
    app.assistant.answerJson({ kind: "text", text: "Fine.", events: [], changes: [], addTodos: [] });

    await send();

    expect(routing.asked.filter((q) => q.mode === "driving")).toHaveLength(1);
  });
});

describe("an answer that falls into the way to an event", () => {
  it("is left out and named: the lecture is at 10:00, the way takes 35 minutes, so 09:30 is on the way", async () => {
    const user = await alice();
    await lecture(user, "10:00", "11:00");
    app.assistant.answerJson(study("09:30", "09:50"));
    await expectLeftOut(await send(), "Study", ON_THE_WAY);
  });

  it("is accepted when it ends as the way starts (09:25)", async () => {
    const user = await alice();
    await lecture(user, "10:00", "11:00");
    app.assistant.answerJson(study("08:25", "09:25"));
    expect((await read(await send())).status).toBe(201);
  });

  it("when the routing is down 30 minutes count instead of nothing", async () => {
    const user = await alice();
    await lecture(user, "10:00", "11:00");
    routing.down = true;
    app.assistant.answerJson(study("09:20", "09:40"));
    await expectLeftOut(await send(), "Study", ON_THE_WAY);
    app.assistant.answerJson(study("08:30", "09:30"));
    expect((await read(await send())).status).toBe(201);
  });
});

describe("a session at a goal's place needs room for the way", () => {
  it("from the event before: lecture ends 15:00, the way is 35 minutes, so 15:15 does not work and 15:40 does", async () => {
    const user = await alice();
    await lecture(user, "14:00", "15:00");
    const goal = await gym(user);
    app.assistant.answerJson(study("15:15", "16:45", goal, "Gym"));
    await expectLeftOut(await send(), "Gym", NO_ROOM);
    app.assistant.answerJson(study("15:40", "17:10", goal, "Gym"));
    expect((await read(await send())).status).toBe(201);
  });

  it("on to the event after: the session ends 16:45, a lecture starts 17:00 somewhere else, so there is no room", async () => {
    const user = await alice();
    const goal = await gym(user);
    await lecture(user, "17:00", "18:00");
    app.assistant.answerJson(study("15:15", "16:45", goal, "Gym"));
    await expectLeftOut(await send(), "Gym", ON_THE_WAY);
    app.assistant.answerJson(study("14:00", "15:30", goal, "Gym"));
    expect((await read(await send())).status).toBe(201);
  });

  it("an event at the same place needs no way at all", async () => {
    const user = await alice();
    await lecture(user, "14:00", "15:00", GYM);
    const goal = await gym(user);
    app.assistant.answerJson(study("15:00", "16:30", goal, "Gym"));
    expect((await read(await send())).status).toBe(201);
  });

  it("a session of a goal without a place needs no way: it may follow an event at once", async () => {
    const user = await alice();
    await lecture(user, "14:00", "15:00");
    const goal = await seedGoal(app.db, user, { title: "Reading", deadline: "2027-03-14", rules: [{ kind: "count", target: 3 }] });
    app.assistant.answerJson(study("15:00", "16:00", goal.id, "Reading"));
    expect((await read(await send())).status).toBe(201);
  });
});
