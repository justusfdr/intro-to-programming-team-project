// Tests for delete_goal (spec 03, What lines 4 and 6; ontology section 5, R1, R3, R4). Same pattern as
// delete-event.test.ts: the accepted case checks what is left; each rejected case checks the exact
// answer and that nothing changed, with app.snapshot() before and after. The two-device case (R4) is two requests.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { eventsOf, seedEvent } from "@test/support/events";
import { goalsOf, seedGoal } from "@test/support/goals";
import { seedTask, tasksOf } from "@test/support/tasks";
import { deleteGoal } from "./delete-goal";

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

function send(id: string, body: unknown, headers?: Record<string, string>) {
  return deleteGoal(postJson(`/api/goals/${id}/delete`, body, headers), app.deps, id);
}

const BODY_FOR = (g: { updatedAt: string }) => ({ updatedAt: g.updatedAt });

describe("delete_goal accepted", () => {
  it("deletes the goal and its rules; its events stay, without goal; the other goal stays; answers 200 'Goal deleted.'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, {
      deadline: "2027-03-14",
      rules: [
        { kind: "count", target: 2, minMinutes: 45 },
        { kind: "hours", target: 3 },
      ],
    });
    const other = await seedGoal(app.db, alice, { title: "Read 20 books", deadline: "2027-06-30", rules: [{ kind: "count", target: 1 }] });
    await seedEvent(app.db, alice, { title: "Run", start: "2026-11-16T07:00:00Z", end: "2026-11-16T08:00:00Z", goalId: goal.id });
    await seedEvent(app.db, alice, { title: "Long run", start: "2026-11-18T07:00:00Z", end: "2026-11-18T09:00:00Z", goalId: goal.id });
    await seedEvent(app.db, alice, { title: "Reading", start: "2026-11-19T18:00:00Z", end: "2026-11-19T19:00:00Z", goalId: other.id });
    const eventsBefore = await eventsOf(app.db, alice);

    const answer = await read(await send(goal.id, BODY_FOR(goal)));

    expect(answer).toEqual({ status: 200, body: { message: "Goal deleted." } });
    expect(await goalsOf(app.db, alice)).toEqual([
      expect.objectContaining({ id: other.id, title: "Read 20 books", rules: [expect.objectContaining({ kind: "count", target: 1 })] }),
    ]);
    const rulesLeft = await app.db.admin<{ n: number }>("select count(*)::int as n from app.rules where goal_id = $1", [goal.id]);
    expect(rulesLeft[0].n).toBe(0);

    const eventsAfter = await eventsOf(app.db, alice);
    expect(eventsAfter).toHaveLength(3);
    // Everything except the goal link (and updated_at, which the database changes when the link is cleared).
    const strip = (rows: typeof eventsBefore) =>
      rows.map((e) => ({ id: e.id, title: e.title, start_at: e.start_at, end_at: e.end_at, may_overlap: e.may_overlap, status: e.status, source: e.source }));
    expect(strip(eventsAfter)).toEqual(strip(eventsBefore));
    expect(eventsAfter.filter((e) => e.title !== "Reading").map((e) => e.goal_id)).toEqual([null, null]);
    expect(eventsAfter.find((e) => e.title === "Reading")?.goal_id).toBe(other.id);
  });
});

describe("delete_goal: 'Not found' for another user's goal (R3)", () => {
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

  it("answers 'Not found' when the same goal is deleted a second time, and changes nothing more", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    expect((await read(await send(goal.id, BODY_FOR(goal)))).status).toBe(200);
    const before = await app.snapshot();

    const again = await read(await send(goal.id, BODY_FOR(goal)));

    expect(again).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("delete_goal: two devices (R4)", () => {
  it("a delete with an older updatedAt answers 409 'Changed on another device. Reload to see the latest version'; the goal stays", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2, minMinutes: 45 }] });
    // Laptop and desktop both loaded the goal, so both hold the same updatedAt.

    // The laptop changes the title first (the database sets a newer updated_at).
    await app.db.admin("update app.goals set title = $2 where id = $1", [goal.id, "Laptop title"]);
    const before = await app.snapshot();

    const desktop = await read(await send(goal.id, BODY_FOR(goal)));

    expect(desktop).toEqual({
      status: 409,
      body: { error: "changed_elsewhere", message: "Changed on another device. Reload to see the latest version" },
    });
    expect(await app.snapshot()).toEqual(before);
    expect(await goalsOf(app.db, alice)).toMatchObject([{ title: "Laptop title", rules: [{ kind: "count", target: 2 }] }]);
  });
});

describe("delete_goal: sign-in and same-origin checks (R3)", () => {
  it("answers 401 without a session and deletes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    await app.auth.signOut();
    const before = await app.snapshot();

    const answer = await read(await send(goal.id, BODY_FOR(goal)));

    expect(answer).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a request from another site (403) and deletes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    const before = await app.snapshot();

    const response = await send(goal.id, BODY_FOR(goal), { origin: "https://evil.example", "sec-fetch-site": "cross-site" });

    expect(response.status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("issue #211: deleting a goal deletes its tasks", () => {
  it("its open and done tasks are deleted; the other goal's tasks and tasks without goal stay", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 1 }] });
    const other = await seedGoal(app.db, alice, { title: "Read 20 books", deadline: "2027-06-30", rules: [{ kind: "count", target: 1 }] });
    await seedTask(app.db, alice, { title: "Buy shoes", goalId: goal.id });
    await seedTask(app.db, alice, { title: "Sign up for the race", goalId: goal.id, status: "done" });
    await seedTask(app.db, alice, { title: "Pick a book", goalId: other.id });
    await seedTask(app.db, alice, { title: "Call mum" });

    expect((await send(goal.id, BODY_FOR(goal))).status).toBe(200);

    expect((await tasksOf(app.db, alice)).map((t) => t.title).sort()).toEqual(["Call mum", "Pick a book"]);
  });

  it("another user's tasks are not touched", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobsGoal = await seedGoal(app.db, bob, { deadline: "2027-03-14", rules: [{ kind: "count", target: 1 }] });
    await seedTask(app.db, bob, { title: "Bob's task", goalId: bobsGoal.id });
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 1 }] });
    await seedTask(app.db, alice, { title: "Alice's task", goalId: goal.id });

    expect((await send(goal.id, BODY_FOR(goal))).status).toBe(200);

    expect((await tasksOf(app.db, bob)).map((t) => t.title)).toEqual(["Bob's task"]);
  });

  it("a refused delete (changed on another device) keeps the tasks", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 1 }] });
    await seedTask(app.db, alice, { title: "Buy shoes", goalId: goal.id });

    expect((await send(goal.id, { updatedAt: "2020-01-01T00:00:00.000Z" })).status).toBe(409);

    expect((await tasksOf(app.db, alice)).map((t) => t.title)).toEqual(["Buy shoes"]);
  });
});
