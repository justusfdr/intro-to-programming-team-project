// Tests for the goal of an event (spec 03, What line "An event links only to its owner's goals"; ontology
// section 5, R3). create_event and edit_event take a goalId: the user's own goal is saved; another user's
// goal, a missing goal and a malformed id all answer the same "Not found", and nothing changes.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { eventsOf, seedEvent } from "@test/support/events";
import { HALF_MARATHON, seedGoal } from "@test/support/goals";
import { createEvent } from "./create-event";
import { editEvent } from "./edit-event";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // the clock stands at Monday 16 November 2026, 09:00 UTC
});

const REVISION = { title: "Statistics revision", start: "2026-11-16T09:00", end: "2026-11-16T11:00" };
// The event as it is in the database: 09:00 to 10:00 UTC (Lisbon is UTC in November).
const SEED = { title: "Statistics revision", start: "2026-11-16T09:00:00Z", end: "2026-11-16T10:00:00Z" };

/** The updated_at of the user's first event, as the device would hold it (R4). */
async function updatedAtOf(userId: string): Promise<string> {
  const [row] = await eventsOf(app.db, userId);
  return new Date(row.updated_at as Date).toISOString();
}

describe("create_event with a goal", () => {
  it("saves the event with the user's goal and answers the event with its goalId", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const run = await seedGoal(app.db, alice, HALF_MARATHON);

    const answer = await read(await createEvent(postJson("/api/events", { ...REVISION, goalId: run.id }), app.deps));

    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({ event: { title: "Statistics revision", goalId: run.id } });
    const [saved] = await eventsOf(app.db, alice);
    expect(saved).toMatchObject({ title: "Statistics revision", goal_id: run.id });
  });

  it("saves goal_id null and answers goalId null when goalId is left out (the old body keeps working)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });

    const answer = await read(await createEvent(postJson("/api/events", REVISION), app.deps));

    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({ event: { goalId: null } });
    const [saved] = await eventsOf(app.db, alice);
    expect(saved).toMatchObject({ goal_id: null });
  });
});

describe("edit_event with a goal", () => {
  it("sets a goal, changes it to another of the user's goals, and clears it with null", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const run = await seedGoal(app.db, alice, HALF_MARATHON);
    const reading = await seedGoal(app.db, alice, { title: "Read 20 books", deadline: "2027-06-30", rules: [{ kind: "count", target: 1 }] });
    const { id } = await seedEvent(app.db, alice, SEED);
    const send = async (goalId: string | null) =>
      read(
        await editEvent(
          postJson(`/api/events/${id}/edit`, {
            title: "Statistics revision",
            start: "2026-11-16T10:00",
            end: "2026-11-16T11:00",
            goalId,
            updatedAt: await updatedAtOf(alice),
          }),
          app.deps,
          id,
        ),
      );

    const toRun = await send(run.id);
    expect(toRun.status).toBe(200);
    expect(toRun.body).toMatchObject({ event: { goalId: run.id } });
    expect(await eventsOf(app.db, alice)).toMatchObject([{ goal_id: run.id }]);

    const toReading = await send(reading.id);
    expect(toReading.status).toBe(200);
    expect(await eventsOf(app.db, alice)).toMatchObject([{ goal_id: reading.id }]);

    const cleared = await send(null);
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ event: { goalId: null } });
    expect(await eventsOf(app.db, alice)).toMatchObject([{ goal_id: null }]);
  });

  // Changed in review: an edit that does not mention the goal keeps it (it used to clear it).
  it("keeps the event's goal and may_overlap when the body leaves them out", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const run = await seedGoal(app.db, alice, HALF_MARATHON);
    const { id } = await seedEvent(app.db, alice, { ...SEED, goalId: run.id, mayOverlap: true });

    const answer = await read(
      await editEvent(
        postJson(`/api/events/${id}/edit`, {
          title: "Statistics revision",
          start: "2026-11-16T10:00",
          end: "2026-11-16T11:00",
          updatedAt: await updatedAtOf(alice),
        }),
        app.deps,
        id,
      ),
    );

    expect(answer.status).toBe(200);
    expect(await eventsOf(app.db, alice)).toMatchObject([{ goal_id: run.id, may_overlap: true, title: "Statistics revision" }]);
  });
});

describe("create_event: 'Not found' for another user's goal (R3)", () => {
  const send = (goalId: string, body: object) => createEvent(postJson("/api/events", { ...REVISION, ...body, goalId }), app.deps);
  const BODY_FOR = (goal: { id: string }) => ({ goalId: goal.id });

  it("answers exactly the same 'Not found' for another user's goal, a missing goal and a malformed id, and changes nothing (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedGoal(app.db, bob, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    const othersGoal = await read(await send(bobs.id, BODY_FOR(bobs)));
    const missing = await read(await send("00000000-0000-4000-8000-000000000000", BODY_FOR(bobs)));
    const malformed = await read(await send("not-a-uuid", BODY_FOR(bobs)));

    expect(othersGoal).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(missing).toEqual(othersGoal);
    expect(malformed).toEqual(othersGoal);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("edit_event: 'Not found' for another user's goal (R3)", () => {
  it("answers exactly the same 'Not found' for another user's goal, a missing goal and a malformed id, and changes nothing (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedGoal(app.db, bob, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    const alice = await app.signedInAs("alice@example.com");
    const run = await seedGoal(app.db, alice, HALF_MARATHON);
    const mine = await seedEvent(app.db, alice, { ...SEED, goalId: run.id });
    const send = (goalId: string, body: object) =>
      editEvent(
        postJson(`/api/events/${mine.id}/edit`, { title: "Revision", start: "2026-11-16T10:00", end: "2026-11-16T12:00", updatedAt: mine.updatedAt, ...body, goalId }),
        app.deps,
        mine.id,
      );
    const BODY_FOR = (goal: { id: string }) => ({ goalId: goal.id });
    const before = await app.snapshot();

    const othersGoal = await read(await send(bobs.id, BODY_FOR(bobs)));
    const missing = await read(await send("00000000-0000-4000-8000-000000000000", BODY_FOR(bobs)));
    const malformed = await read(await send("not-a-uuid", BODY_FOR(bobs)));

    expect(othersGoal).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(missing).toEqual(othersGoal);
    expect(malformed).toEqual(othersGoal);
    expect(await app.snapshot()).toEqual(before);
    expect(await eventsOf(app.db, alice)).toMatchObject([{ title: "Statistics revision", goal_id: run.id }]);
  });
});
