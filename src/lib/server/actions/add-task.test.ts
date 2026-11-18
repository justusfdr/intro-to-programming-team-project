// Tests for add_task (spec 11; ontology section 5, R1, R3, R32, A16). Same pattern as create-goal.test.ts:
// the accepted case checks the saved row; each rejected case checks the exact answer and that nothing
// changed, with app.snapshot() before and after.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { HALF_MARATHON, seedGoal } from "@test/support/goals";
import { seedOpenTasks, seedTask, tasksOf } from "@test/support/tasks";
import { addTask } from "./add-task";

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

function send(body: unknown, headers?: Record<string, string>) {
  return addTask(postJson("/api/tasks", body, headers), app.deps);
}

const SHOES = { title: "Buy running shoes", dueDate: "2026-11-20" };

describe("add_task accepted", () => {
  it("saves the task open under the user's goal and answers 201 'Task saved.' with the task", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { ...HALF_MARATHON, title: "Half marathon" });

    const answer = await read(await send({ ...SHOES, goalId: goal.id }));

    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({
      message: "Task saved.",
      task: { title: "Buy running shoes", goalId: goal.id, dueDate: "2026-11-20", status: "open", doneAt: null },
    });
    expect(await tasksOf(app.db, alice)).toMatchObject([
      { title: "Buy running shoes", goal_id: goal.id, due_date: "2026-11-20", status: "open", done_at: null },
    ]);
  });

  it("saves a task without goal (Other to-dos) and without due date; empty fields mean none", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect((await send({ title: "Call mom back" })).status).toBe(201);
    expect((await send({ title: "Renew passport", goalId: null, dueDate: null })).status).toBe(201);
    expect((await send({ title: "Pay rent", goalId: "", dueDate: "" })).status).toBe(201);
    expect((await tasksOf(app.db, alice)).map((t) => [t.goal_id, t.due_date])).toEqual([
      [null, null],
      [null, null],
      [null, null],
    ]);
  });

  it("accepts today as due date, a 100-character title, and trims the title", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect((await send({ title: "  Today  ", dueDate: "2026-11-16" })).status).toBe(201);
    expect((await send({ title: "x".repeat(100) })).status).toBe(201);
    expect((await tasksOf(app.db, alice)).map((t) => t.title)).toEqual(["Today", "x".repeat(100)]);
  });

  it("accepts the 100th open task; done tasks do not count", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedOpenTasks(app.db, alice, 99);
    await seedTask(app.db, alice, { title: "Done", status: "done" });
    expect((await send(SHOES)).status).toBe(201);
    expect((await tasksOf(app.db, alice)).filter((t) => t.status === "open")).toHaveLength(100);
  });
});

describe("add_task rejected: nothing is saved (R1)", () => {
  it.each([
    ["an empty title", { title: "" }, 400, "title_length", "Title must be 1 to 100 characters"],
    ["a title of only spaces", { title: "   " }, 400, "title_length", "Title must be 1 to 100 characters"],
    ["a 101-character title", { title: "x".repeat(101) }, 400, "title_length", "Title must be 1 to 100 characters"],
    ["yesterday as due date", { dueDate: "2026-11-15" }, 400, "due_past", "The due date cannot be in the past"],
  ])("rejects %s", async (_case, change, status, error, message) => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    const answer = await read(await send({ ...SHOES, ...change }));

    expect(answer).toEqual({ status, body: { error, message } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("A16: at 100 open tasks: 'You can have at most 100 open tasks'; nothing saved", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedOpenTasks(app.db, alice, 100);
    const before = await app.snapshot();

    const answer = await read(await send(SHOES));

    expect(answer).toEqual({ status: 409, body: { error: "too_many_tasks", message: "You can have at most 100 open tasks" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("two additions at the same moment at 99 open tasks: one is saved, the other gets the limit message", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedOpenTasks(app.db, alice, 99);

    const answers = await Promise.all((await Promise.all([send({ title: "First" }), send({ title: "Second" })])).map(read));

    expect(answers.map((a) => a.status).sort()).toEqual([201, 409]);
    expect(answers.find((a) => a.status === 409)?.body.message).toBe("You can have at most 100 open tasks");
    expect(await tasksOf(app.db, alice)).toHaveLength(100);
  });

  it("when the other request saves between our count and our insert, the database refuses it with the same message", async () => {
    // Simulates the moment between the action's count and its insert: the action is told 99, the
    // database holds 100. Only the database's own check can stop this one.
    const alice = await app.signedInAs("alice@example.com");
    await seedOpenTasks(app.db, alice, 100);
    const before = await app.snapshot();
    const fooled: typeof app.deps = {
      ...app.deps,
      withUser: (userId, fn) =>
        app.db.withUser(userId, (query) =>
          fn(((sql: string, params?: readonly unknown[]) =>
            sql.includes("count(*)::int as n from app.tasks") ? Promise.resolve([{ n: 99 }]) : query(sql, params)) as typeof query),
        ),
    };

    const answer = await read(await addTask(postJson("/api/tasks", SHOES), fooled));

    expect(answer).toEqual({ status: 409, body: { error: "too_many_tasks", message: "You can have at most 100 open tasks" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("judges 'the past' by the user's own calendar: 16 November is already yesterday in Auckland", async () => {
    app.advance(4 * 3_600_000); // 13:00 UTC = Tuesday 17 November, 02:00 in Auckland
    await app.signedInAs("kiri@example.com", { timeZone: "Pacific/Auckland" });
    const answer = await read(await send({ ...SHOES, dueDate: "2026-11-16" }));
    expect(answer.body.message).toBe("The due date cannot be in the past");
  });

  it("names the first problem in the ontology's order: title before due date before the limit", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedOpenTasks(app.db, alice, 100);
    expect((await read(await send({ title: "", dueDate: "2020-01-01" }))).body.message).toBe("Title must be 1 to 100 characters");
    expect((await read(await send({ title: "Ok", dueDate: "2020-01-01" }))).body.message).toBe("The due date cannot be in the past");
  });

  it("answers 'Not found' for another user's goal, a missing goal and a malformed id; nothing saved (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobsGoal = await seedGoal(app.db, bob, HALF_MARATHON);
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    for (const goalId of [bobsGoal.id, "00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      expect(await read(await send({ ...SHOES, goalId })), goalId).toEqual({
        status: 404,
        body: { error: "not_found", message: "Not found" },
      });
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects bodies of the wrong shape with 400 and a body over the size limit with 413", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    for (const body of [
      { ...SHOES, dueDate: "next week" },
      { ...SHOES, dueDate: "2026-02-30" },
      { ...SHOES, title: undefined },
      { ...SHOES, title: 5 },
      { ...SHOES, goalId: 7 },
      "not json",
    ]) {
      expect((await send(body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect((await send({ title: "x".repeat(20_000) })).status).toBe(413);
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 401 without a session and 403 from another site; nothing saved", async () => {
    const before = await app.snapshot();
    expect(await read(await send(SHOES))).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);

    await app.signedInAs("alice@example.com");
    const signedIn = await app.snapshot();
    expect((await send(SHOES, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(await app.snapshot()).toEqual(signedIn);
  });
});
