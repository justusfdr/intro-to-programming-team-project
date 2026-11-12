// Tests for supabase/migrations/*_tasks.sql (spec 11): row-level security (R3), which columns a user
// may write, a task's goal only within one user's rows, the checks, done_at set by the database,
// what deleting a goal does (A17), and at most 100 open tasks (R32), also for two requests at once.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedGoal } from "@test/support/goals";
import { seedOpenTasks, seedTask, tasksOf } from "@test/support/tasks";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.admin("delete from auth.users");
  alice = await db.createUser("alice@example.com", { confirmed: true });
  bob = await db.createUser("bob@example.com", { confirmed: true });
});

const COUNT_2 = { kind: "count" as const, target: 2, minMinutes: 45 };

/** A task added as the user, the way add_task writes it. */
function addAs(userId: string, title = "Buy running shoes", goalId: string | null = null) {
  return db.withUser(userId, (q) =>
    q<{ id: string }>("insert into app.tasks (title, goal_id, due_date) values ($1, $2, '2026-11-20') returning id", [title, goalId]),
  );
}

describe("tasks belong to their user (R3)", () => {
  it("lets a user add a task; the database fills in owner, status, done_at, created_at and updated_at", async () => {
    const [{ id }] = await addAs(alice);
    const [task] = await db.admin(
      "select user_id, status, done_at, created_at is not null as created, updated_at is not null as updated from app.tasks where id = $1",
      [id],
    );
    expect(task).toEqual({ user_id: alice, status: "open", done_at: null, created: true, updated: true });
  });

  it("hides another user's task: not returned, not changed, not completed, not deleted", async () => {
    const bobs = await seedTask(db, bob);
    const before = await tasksOf(db, bob);

    expect(await db.withUser(alice, (q) => q("select * from app.tasks"))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("update app.tasks set title = 'x' where id = $1 returning id", [bobs]))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("update app.tasks set status = 'done' where id = $1 returning id", [bobs]))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("delete from app.tasks where id = $1 returning id", [bobs]))).toEqual([]);

    expect(await tasksOf(db, bob)).toEqual(before);
  });

  it("deletes a user's tasks with the user", async () => {
    await seedTask(db, alice);
    await db.admin("delete from auth.users where id = $1", [alice]);
    expect(await db.admin("select * from app.tasks")).toEqual([]);
  });
});

describe("only title, goal, due date and status are writable", () => {
  it("accepts a change of title, goal, due date and status", async () => {
    const goal = await seedGoal(db, alice, { deadline: "2027-03-14", rules: [COUNT_2] });
    const id = await seedTask(db, alice);
    await db.withUser(alice, (q) =>
      q("update app.tasks set title = 'New', goal_id = $2, due_date = '2026-12-01', status = 'done' where id = $1", [id, goal.id]),
    );
    expect(await tasksOf(db, alice)).toMatchObject([{ title: "New", goal_id: goal.id, due_date: "2026-12-01", status: "done" }]);
  });

  it("refuses the columns the database owns, on insert and on update; nothing changes", async () => {
    const id = await seedTask(db, alice);
    const before = await tasksOf(db, alice);
    for (const column of ["id", "user_id", "status", "done_at", "created_at", "updated_at"]) {
      const value = column === "status" ? "'done'" : column.endsWith("_at") ? "now()" : column === "id" ? "gen_random_uuid()" : `'${alice}'`;
      await expect(
        db.withUser(alice, (q) => q(`insert into app.tasks (title, ${column}) values ('x', ${value})`)),
        `insert ${column}`,
      ).rejects.toThrow(/permission denied/);
    }
    for (const assignment of ["id = id", "user_id = user_id", "done_at = now()", "created_at = now()", "updated_at = now()"]) {
      await expect(
        db.withUser(alice, (q) => q(`update app.tasks set ${assignment} where id = $1`, [id])),
        assignment,
      ).rejects.toThrow(/permission denied/);
    }
    expect(await tasksOf(db, alice)).toEqual(before);
  });

  it("gives no rights at all to visitors who are not signed in (anon)", async () => {
    const rows = await db.admin<{ privilege_type: string }>(
      "select privilege_type from information_schema.role_table_grants where table_schema = 'app' and table_name = 'tasks' and grantee = 'anon'",
    );
    expect(rows).toEqual([]);
  });
});

describe("a task's goal is one of the user's goals or none (R32)", () => {
  it("accepts the user's own goal and no goal", async () => {
    const goal = await seedGoal(db, alice, { deadline: "2027-03-14", rules: [COUNT_2] });
    await addAs(alice, "With goal", goal.id);
    await addAs(alice, "Inbox", null);
    expect((await tasksOf(db, alice)).map((t) => t.goal_id).sort()).toEqual([goal.id, null].sort());
  });

  it("refuses another user's goal on insert and on update, even with its id", async () => {
    const bobsGoal = await seedGoal(db, bob, { deadline: "2027-03-14", rules: [COUNT_2] });
    await expect(addAs(alice, "Steal", bobsGoal.id)).rejects.toThrow(/tasks_goal_of_same_user/);

    const own = await seedTask(db, alice);
    await expect(
      db.withUser(alice, (q) => q("update app.tasks set goal_id = $2 where id = $1", [own, bobsGoal.id])),
    ).rejects.toThrow(/tasks_goal_of_same_user/);
    expect(await tasksOf(db, alice)).toMatchObject([{ goal_id: null }]);
  });

  it("A17 in the database: deleting a goal keeps its two tasks without goal", async () => {
    const goal = await seedGoal(db, alice, { deadline: "2027-03-14", rules: [COUNT_2] });
    await seedTask(db, alice, { title: "One", goalId: goal.id });
    await seedTask(db, alice, { title: "Two", goalId: goal.id, status: "done" });

    await db.withUser(alice, (q) => q("delete from app.goals where id = $1", [goal.id]));

    expect(await tasksOf(db, alice)).toMatchObject([
      { title: "One", goal_id: null, status: "open" },
      { title: "Two", goal_id: null, status: "done" },
    ]);
  });
});

describe("checks", () => {
  it("accepts titles of 1 and 100 characters and refuses 0 and 101", async () => {
    await addAs(alice, "x");
    await addAs(alice, "x".repeat(100));
    await expect(addAs(alice, "")).rejects.toThrow(/tasks_title_length/);
    await expect(addAs(alice, "x".repeat(101))).rejects.toThrow(/tasks_title_length/);
    expect(await tasksOf(db, alice)).toHaveLength(2);
  });

  it("accepts only the statuses open and done", async () => {
    const id = await seedTask(db, alice);
    await expect(db.withUser(alice, (q) => q("update app.tasks set status = 'later' where id = $1", [id]))).rejects.toThrow(
      /tasks_status/,
    );
    expect(await tasksOf(db, alice)).toMatchObject([{ status: "open" }]);
  });
});

describe("done_at is set by the database", () => {
  it("is set when a task becomes done, kept while it stays done, emptied when it is reopened", async () => {
    const id = await seedTask(db, alice);
    await db.withUser(alice, (q) => q("update app.tasks set status = 'done' where id = $1", [id]));
    const [done] = await tasksOf(db, alice);
    expect(done.done_at).not.toBeNull();

    await db.withUser(alice, (q) => q("update app.tasks set title = 'Renamed' where id = $1", [id]));
    const [renamed] = await tasksOf(db, alice);
    expect(renamed.done_at).toEqual(done.done_at);

    await db.withUser(alice, (q) => q("update app.tasks set status = 'open' where id = $1", [id]));
    expect(await tasksOf(db, alice)).toMatchObject([{ status: "open", done_at: null }]);
  });

  it("gives updated_at a new value on every change", async () => {
    const id = await seedTask(db, alice);
    const [before] = await tasksOf(db, alice);
    await db.withUser(alice, (q) => q("update app.tasks set title = 'Renamed' where id = $1", [id]));
    const [after] = await tasksOf(db, alice);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime());
  });
});

describe("at most 100 open tasks per user (R32)", () => {
  it("accepts the 100th open task and refuses the 101st; nothing is saved", async () => {
    await seedOpenTasks(db, alice, 99);
    await addAs(alice, "Hundredth");
    await expect(addAs(alice, "One too many")).rejects.toThrow(/You can have at most 100 open tasks/);
    expect(await tasksOf(db, alice)).toHaveLength(100);
  });

  it("does not count done tasks or another user's tasks", async () => {
    await seedOpenTasks(db, alice, 99);
    await seedTask(db, alice, { title: "Done", status: "done" });
    await seedOpenTasks(db, bob, 100);
    await addAs(alice, "Hundredth");
    expect((await tasksOf(db, alice)).filter((t) => t.status === "open")).toHaveLength(100);
  });

  it("refuses reopening a task at 100 open ones and accepts it at 99", async () => {
    const done = await seedTask(db, alice, { title: "Done", status: "done" });
    await seedOpenTasks(db, alice, 100);
    await expect(db.withUser(alice, (q) => q("update app.tasks set status = 'open' where id = $1", [done]))).rejects.toThrow(
      /You can have at most 100 open tasks/,
    );
    expect((await tasksOf(db, alice)).find((t) => t.id === done)).toMatchObject({ status: "done" });

    await db.admin("delete from app.tasks where user_id = $1 and title = 'Task 1'", [alice]);
    await db.withUser(alice, (q) => q("update app.tasks set status = 'open' where id = $1", [done]));
    expect((await tasksOf(db, alice)).find((t) => t.id === done)).toMatchObject({ status: "open" });
  });

  it("still lets a user complete, rename or delete tasks at 100 open ones", async () => {
    await seedOpenTasks(db, alice, 100);
    const [first, second] = await tasksOf(db, alice);
    await db.withUser(alice, (q) => q("update app.tasks set title = 'Renamed' where id = $1", [first.id]));
    await db.withUser(alice, (q) => q("update app.tasks set status = 'done' where id = $1", [first.id]));
    await db.withUser(alice, (q) => q("delete from app.tasks where id = $1", [second.id]));
    expect(await tasksOf(db, alice)).toHaveLength(99);
  });

  it("takes a lock per user before counting, so two requests at the same moment take turns", async () => {
    // The lock is held until the transaction ends; a second transaction for the same user waits for
    // it and then counts the first one's task. Here: the adding transaction holds an advisory lock.
    const locks = await db.withUser(alice, async (q) => {
      await q("insert into app.tasks (title) values ('Locked')");
      return q<{ n: number }>("select count(*)::int as n from pg_locks where locktype = 'advisory' and granted");
    });
    expect(locks[0].n).toBeGreaterThanOrEqual(1);
  });

  it("two additions at the same moment at 99 open tasks: exactly one is saved", async () => {
    await seedOpenTasks(db, alice, 99);
    const results = await Promise.allSettled([addAs(alice, "First"), addAs(alice, "Second")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await tasksOf(db, alice)).toHaveLength(100);
  });
});
