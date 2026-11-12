// Actions send their independent reads together, after the identity statement, in one round
// (counted with the driver in test/support/counting.ts). What the actions answer is tested in their
// own test files; this only checks how the reads travel.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, fromExtension, postJson, read, type TestApp } from "@test/support/app";
import { countingWithUser, firstRoundOf, heldBack } from "@test/support/counting";
import { seedEvent } from "@test/support/events";
import { seedTask } from "@test/support/tasks";
import { addTask } from "./add-task";
import { editEvent } from "./edit-event";
import { editTask } from "./edit-task";
import { extensionState } from "./extension-state";
import { reopenTask } from "./task-status";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // Monday 16 November 2026, 09:00 UTC
});

let last: { transactions: ReturnType<typeof countingWithUser>["transactions"] } | null = null;

function counted() {
  const { withUser, transactions } = countingWithUser(app.db);
  last = { transactions };
  return { deps: { ...app.deps, withUser }, transactions };
}

const IDENTITY = /set_config\('role', 'authenticated', true\)/;

afterEach(() => {
  // In every test: nothing without parameters waits behind a statement with parameters.
  for (const sent of last?.transactions ?? []) expect(heldBack(sent)).toEqual([]);
  last = null;
});

describe("independent reads travel together", () => {
  it("add_task reads the time zone and the open-task count in the first round", async () => {
    await app.signedInAs("alice@example.com");
    const { deps, transactions } = counted();
    expect((await read(await addTask(postJson("/api/tasks", { title: "Buy shoes", dueDate: null }), deps))).status).toBe(201);
    const main = transactions[transactions.length - 1];
    const first = firstRoundOf(main);
    expect(first[0]).toMatch(IDENTITY);
    expect(first.some((sql) => sql.includes("from app.settings"))).toBe(true);
    expect(first.some((sql) => sql.includes("count(*)"))).toBe(true);
  });

  it("reopen_task reads the count and the task in the first round", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedTask(app.db, alice, { status: "done" });
    const { deps, transactions } = counted();
    expect((await read(await reopenTask(postJson(`/api/tasks/${id}/open`, {}), deps, id))).status).toBe(200);
    const first = firstRoundOf(transactions[transactions.length - 1]);
    expect(first).toHaveLength(3);
    expect(first[0]).toMatch(IDENTITY);
  });

  it("edit_task reads the time zone and the task in the first round", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedTask(app.db, alice);
    const { deps, transactions } = counted();
    const answer = await read(await editTask(postJson(`/api/tasks/${id}/edit`, { title: "New", dueDate: null, goalId: null }), deps, id));
    expect(answer.status).toBe(200);
    expect(firstRoundOf(transactions[transactions.length - 1])).toHaveLength(3);
  });

  it("edit_event reads the time zone and the event in the first round", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const event = await seedEvent(app.db, alice, { start: "2026-11-17T10:00:00Z", end: "2026-11-17T11:00:00Z" });
    const { deps, transactions } = counted();
    const body = { title: "Moved", start: "2026-11-17T12:00", end: "2026-11-17T13:00", updatedAt: event.updatedAt };
    const answer = await read(await editEvent(postJson(`/api/events/${event.id}/edit`, body), deps, event.id));
    expect(answer.status).toBe(200);
    expect(transactions).toHaveLength(1);
    expect(firstRoundOf(transactions[0])).toHaveLength(3);
  });

  it("the extension's state request sends its three statements in the first round", async () => {
    await app.signedInAs("alice@example.com");
    const { deps, transactions } = counted();
    expect((await extensionState(fromExtension("/api/extension/state"), deps)).status).toBe(200);
    const first = firstRoundOf(transactions[transactions.length - 1]);
    expect(first[0]).toMatch(IDENTITY);
    expect(first.some((sql) => sql.includes("mark_extension_seen"))).toBe(true);
    expect(first.some((sql) => sql.includes("app.blocked_sites"))).toBe(true);
    expect(first.some((sql) => sql.includes("status = 'running'"))).toBe(true);
  });
});
