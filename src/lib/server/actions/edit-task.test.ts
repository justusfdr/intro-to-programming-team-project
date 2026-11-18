// Tests for edit_task (spec 11; ontology section 5, R1, R3, R32). Same pattern as edit-goal.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { HALF_MARATHON, seedGoal } from "@test/support/goals";
import { seedOpenTasks, seedTask, tasksOf } from "@test/support/tasks";
import { editTask } from "./edit-task";

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
  return editTask(postJson(`/api/tasks/${id}/edit`, body, headers), app.deps, id);
}

describe("edit_task accepted", () => {
  it("changes title, due date and goal and answers 'Task saved.' with the task", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, HALF_MARATHON);
    const id = await seedTask(app.db, alice, { title: "Buy shoes" });

    const answer = await read(await send(id, { title: "Buy running shoes", goalId: goal.id, dueDate: "2026-11-20" }));

    expect(answer).toMatchObject({
      status: 200,
      body: { message: "Task saved.", task: { id, title: "Buy running shoes", goalId: goal.id, dueDate: "2026-11-20", status: "open" } },
    });
    expect(await tasksOf(app.db, alice)).toMatchObject([{ title: "Buy running shoes", goal_id: goal.id, due_date: "2026-11-20" }]);
  });

  it("moves a task to Other to-dos and removes its due date", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, HALF_MARATHON);
    const id = await seedTask(app.db, alice, { goalId: goal.id, dueDate: "2026-11-20" });
    expect((await send(id, { title: "Buy running shoes", goalId: null, dueDate: null })).status).toBe(200);
    expect(await tasksOf(app.db, alice)).toMatchObject([{ goal_id: null, due_date: null }]);
  });

  it("keeps an unchanged past due date (not past 'when set or changed')", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedTask(app.db, alice, { dueDate: "2026-11-10" });
    expect((await send(id, { title: "Renamed", dueDate: "2026-11-10" })).status).toBe(200);
    expect(await tasksOf(app.db, alice)).toMatchObject([{ title: "Renamed", due_date: "2026-11-10" }]);
  });

  it("edits a task at 100 open tasks (the limit is for adding and reopening only)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedOpenTasks(app.db, alice, 100);
    const [first] = await tasksOf(app.db, alice);
    expect((await send(first.id, { title: "Renamed" })).status).toBe(200);
  });
});

describe("edit_task rejected: nothing changes (R1)", () => {
  it.each([
    ["an empty title", { title: "" }, "title_length", "Title must be 1 to 100 characters"],
    ["a 101-character title", { title: "x".repeat(101) }, "title_length", "Title must be 1 to 100 characters"],
    ["a changed due date in the past", { title: "Ok", dueDate: "2026-11-15" }, "due_past", "The due date cannot be in the past"],
  ])("rejects %s", async (_case, body, error, message) => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedTask(app.db, alice, { dueDate: "2026-11-10" });
    const before = await app.snapshot();

    expect(await read(await send(id, body))).toEqual({ status: 400, body: { error, message } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 'Not found' for another user's task, a missing task and a malformed id; B's task stays (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobsTask = await seedTask(app.db, bob);
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    for (const id of [bobsTask, "00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      expect(await read(await send(id, { title: "Mine now" })), id).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 'Not found' when the task would move to another user's goal; nothing changes", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobsGoal = await seedGoal(app.db, bob, HALF_MARATHON);
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedTask(app.db, alice);
    const before = await app.snapshot();

    expect(await read(await send(id, { title: "Buy running shoes", goalId: bobsGoal.id }))).toEqual({
      status: 404,
      body: { error: "not_found", message: "Not found" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 400 for a wrong shape, 401 without a session and 403 from another site; nothing changes", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedTask(app.db, alice);
    const before = await app.snapshot();
    expect((await send(id, { title: "Ok", dueDate: "soon" })).status).toBe(400);
    expect((await send(id, { title: ["x"] })).status).toBe(400);
    expect((await send(id, { title: "Ok" }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    await app.auth.signOut();
    expect((await send(id, { title: "Ok" })).status).toBe(401);
    expect((await app.snapshot()).tables).toEqual(before.tables);
  });
});
