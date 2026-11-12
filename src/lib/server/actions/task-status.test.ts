// Tests for complete_task and reopen_task (spec 11; ontology section 4 and 5, R1, R3, R32) and for
// delete_task (always allowed). Same pattern as event-status.test.ts: no body, one answer per outcome.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedOpenTasks, seedTask, tasksOf } from "@test/support/tasks";
import { deleteTask } from "./delete-task";
import { completeTask, reopenTask } from "./task-status";

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

const complete = (id: string, headers?: Record<string, string>) => completeTask(postJson(`/api/tasks/${id}/done`, {}, headers), app.deps, id);
const reopen = (id: string, headers?: Record<string, string>) => reopenTask(postJson(`/api/tasks/${id}/open`, {}, headers), app.deps, id);
const remove = (id: string, headers?: Record<string, string>) => deleteTask(postJson(`/api/tasks/${id}/delete`, {}, headers), app.deps, id);

const NOT_FOUND = { status: 404, body: { error: "not_found", message: "Not found" } };
const NOT_POSSIBLE = { status: 409, body: { error: "not_possible", message: "Not possible in this state" } };

describe("complete_task", () => {
  it("turns an open task done; the database sets done_at; answers 'Task done.'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedTask(app.db, alice);

    const answer = await read(await complete(id));

    expect(answer).toMatchObject({ status: 200, body: { message: "Task done.", task: { id, status: "done" } } });
    expect((answer.body.task as { doneAt: string | null }).doneAt).not.toBeNull();
    const [row] = await tasksOf(app.db, alice);
    expect(row.status).toBe("done");
    expect(row.done_at).not.toBeNull();
  });

  it("is allowed at 100 open tasks", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedOpenTasks(app.db, alice, 100);
    const [first] = await tasksOf(app.db, alice);
    expect((await complete(first.id)).status).toBe(200);
  });

  it("rejects a task that is already done: 'Not possible in this state'; nothing changes", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedTask(app.db, alice, { status: "done" });
    const before = await app.snapshot();
    expect(await read(await complete(id))).toEqual(NOT_POSSIBLE);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("reopen_task", () => {
  it("turns a done task open again and empties done_at; answers 'Task reopened.'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedTask(app.db, alice, { status: "done" });

    const answer = await read(await reopen(id));

    expect(answer).toMatchObject({ status: 200, body: { message: "Task reopened.", task: { id, status: "open", doneAt: null } } });
    expect(await tasksOf(app.db, alice)).toMatchObject([{ status: "open", done_at: null }]);
  });

  it("rejects an open task: 'Not possible in this state'; nothing changes", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedTask(app.db, alice);
    const before = await app.snapshot();
    expect(await read(await reopen(id))).toEqual(NOT_POSSIBLE);
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects at 100 open tasks: 'You can have at most 100 open tasks'; nothing changes (R32)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedTask(app.db, alice, { status: "done" });
    await seedOpenTasks(app.db, alice, 100);
    const before = await app.snapshot();
    expect(await read(await reopen(id))).toEqual({
      status: 409,
      body: { error: "too_many_tasks", message: "You can have at most 100 open tasks" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("accepts at 99 open tasks", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedTask(app.db, alice, { status: "done" });
    await seedOpenTasks(app.db, alice, 99);
    expect((await reopen(id)).status).toBe(200);
  });
});

describe("delete_task", () => {
  it("deletes an open or a done task and answers 'Task deleted.'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const open = await seedTask(app.db, alice, { title: "Open" });
    const done = await seedTask(app.db, alice, { title: "Done", status: "done" });
    const kept = await seedTask(app.db, alice, { title: "Kept" });

    expect(await read(await remove(open))).toEqual({ status: 200, body: { message: "Task deleted." } });
    expect((await remove(done)).status).toBe(200);
    expect((await tasksOf(app.db, alice)).map((t) => t.id)).toEqual([kept]);
  });
});

describe("another user's task (R3), missing and malformed ids, sign-in and origin", () => {
  it("answers 'Not found' to complete, reopen and delete of B's task; B's task stays", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobsOpen = await seedTask(app.db, bob, { title: "Open" });
    const bobsDone = await seedTask(app.db, bob, { title: "Done", status: "done" });
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    expect(await read(await complete(bobsOpen))).toEqual(NOT_FOUND);
    expect(await read(await reopen(bobsDone))).toEqual(NOT_FOUND);
    expect(await read(await remove(bobsOpen))).toEqual(NOT_FOUND);
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 'Not found' for a missing and a malformed id", async () => {
    await app.signedInAs("alice@example.com");
    for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid", "x".repeat(500)]) {
      expect(await read(await complete(id))).toEqual(NOT_FOUND);
      expect(await read(await reopen(id))).toEqual(NOT_FOUND);
      expect(await read(await remove(id))).toEqual(NOT_FOUND);
    }
  });

  it("answers 401 without a session and 403 from another site; nothing changes", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const open = await seedTask(app.db, alice, { title: "Open" });
    const done = await seedTask(app.db, alice, { title: "Done", status: "done" });
    const before = await app.snapshot();
    const evil = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };

    expect((await complete(open, evil)).status).toBe(403);
    expect((await reopen(done, evil)).status).toBe(403);
    expect((await remove(open, evil)).status).toBe(403);
    await app.auth.signOut();
    expect((await complete(open)).status).toBe(401);
    expect((await reopen(done)).status).toBe(401);
    expect((await remove(open)).status).toBe(401);
    expect((await app.snapshot()).tables).toEqual(before.tables);
  });
});
