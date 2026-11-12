// Tests for reading tasks for the goals column (spec 11; R33) and the acceptance scenarios A15 and A17:
// only the user's tasks, in R33's order; done tasks older than 7 days are removed by themselves, in a
// transaction of their own, so a rejected action cannot bring them back.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { HALF_MARATHON, seedGoal } from "@test/support/goals";
import { backdateDone, seedTask, tasksOf } from "@test/support/tasks";
import { addTask } from "@/lib/server/actions/add-task";
import { deleteGoal } from "@/lib/server/actions/delete-goal";
import { completeTask } from "@/lib/server/actions/task-status";
import { openCount } from "@/lib/tasks/order";
import { loadTasks } from "./load";

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

describe("loadTasks", () => {
  it("returns only the user's tasks, open by due date (no date last), then done ones (R33)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await seedTask(app.db, bob, { title: "Bob's" });
    const alice = await app.signedInAs("alice@example.com");
    await seedTask(app.db, alice, { title: "No date" });
    await seedTask(app.db, alice, { title: "Done", status: "done", dueDate: "2026-11-17" });
    await seedTask(app.db, alice, { title: "Nov 20", dueDate: "2026-11-20" });
    await seedTask(app.db, alice, { title: "Nov 18", dueDate: "2026-11-18" });

    const tasks = await loadTasks(app.deps, alice);

    expect(tasks.map((t) => t.title)).toEqual(["Nov 18", "Nov 20", "No date", "Done"]);
  });

  it("removes done tasks done 7 days ago or more, keeps younger done tasks and every open task", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const old = await seedTask(app.db, alice, { title: "Old", status: "done" });
    const young = await seedTask(app.db, alice, { title: "Young", status: "done" });
    await seedTask(app.db, alice, { title: "Open" });
    await backdateDone(app.db, old, "7 days 1 minute");
    await backdateDone(app.db, young, "6 days 23 hours");

    const tasks = await loadTasks(app.deps, alice);

    expect(tasks.map((t) => t.title)).toEqual(["Open", "Young"]);
    expect((await tasksOf(app.db, alice)).map((t) => t.title).sort()).toEqual(["Open", "Young"]);
  });

  it("does not touch another user's old done tasks", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobsOld = await seedTask(app.db, bob, { status: "done" });
    await backdateDone(app.db, bobsOld, "30 days");
    const alice = await app.signedInAs("alice@example.com");
    await loadTasks(app.deps, alice);
    expect(await tasksOf(app.db, bob)).toHaveLength(1);
  });

  it("the removal stays saved when the user's next action is rejected; the action itself changes nothing (R1)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const old = await seedTask(app.db, alice, { title: "Old", status: "done" });
    await seedTask(app.db, alice, { title: "Open" });
    await backdateDone(app.db, old, "8 days");

    const answer = await read(await addTask(postJson("/api/tasks", { title: "" }), app.deps));

    expect(answer.body.message).toBe("Title must be 1 to 100 characters");
    expect((await tasksOf(app.db, alice)).map((t) => t.title)).toEqual(["Open"]);
  });
});

describe("acceptance scenarios", () => {
  it("A15: 'Buy running shoes' for 'Half marathon', due 20 Nov: listed under the goal, count 1; completed: struck through (done), count 0", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { ...HALF_MARATHON, title: "Half marathon" });

    const added = await read(await addTask(postJson("/api/tasks", { title: "Buy running shoes", goalId: goal.id, dueDate: "2026-11-20" }), app.deps));
    expect(added.status).toBe(201);

    const underGoal = (await loadTasks(app.deps, alice)).filter((t) => t.goalId === goal.id);
    expect(underGoal).toMatchObject([{ title: "Buy running shoes", dueDate: "2026-11-20", status: "open" }]);
    expect(openCount(underGoal)).toBe(1);

    const id = (added.body.task as { id: string }).id;
    expect((await completeTask(postJson(`/api/tasks/${id}/done`, {}), app.deps, id)).status).toBe(200);

    const after = (await loadTasks(app.deps, alice)).filter((t) => t.goalId === goal.id);
    expect(after).toMatchObject([{ title: "Buy running shoes", status: "done" }]);
    expect(openCount(after)).toBe(0);
  });

  it("A17: deleting a goal with two tasks lists both under Inbox (no goal)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, HALF_MARATHON);
    await seedTask(app.db, alice, { title: "Buy running shoes", goalId: goal.id });
    await seedTask(app.db, alice, { title: "Sign up for the race", goalId: goal.id, status: "done" });

    const answer = await deleteGoal(postJson(`/api/goals/${goal.id}/delete`, { updatedAt: goal.updatedAt }), app.deps, goal.id);
    expect(answer.status).toBe(200);

    const tasks = await loadTasks(app.deps, alice);
    expect(tasks.map((t) => [t.title, t.goalId])).toEqual([
      ["Buy running shoes", null],
      ["Sign up for the race", null],
    ]);
  });
});
