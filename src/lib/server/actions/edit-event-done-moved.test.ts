// Issue #124: a done event moved so that it starts in the future is open again ("planned"); it has not
// happened yet, so it must not count for its goal. Moved within the past, it stays done.
// The clock stands at Monday 16 November 2026, 09:00 UTC (Lisbon is UTC in November).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
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
  await app.reset();
});

const edit = async (id: string, body: unknown) => read(await editEvent(postJson(`/api/events/${id}/edit`, body), app.deps, id));
const statusOf = async (id: string) => (await app.db.admin<{ status: string }>("select status from app.events where id = $1", [id]))[0].status;

// Done this morning, 07:00 to 08:00.
const DONE = { title: "Study", start: "2026-11-16T07:00:00Z", end: "2026-11-16T08:00:00Z", status: "done" as const };

describe("issue #124: moving a done event", () => {
  it("moved to tomorrow, it is planned again and no longer counts for its goal", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 6 }] });
    const { id, updatedAt } = await seedEvent(app.db, alice, { ...DONE, goalId: goal.id });

    const answer = await edit(id, { title: "Study", start: "2026-11-17T07:00", end: "2026-11-17T08:00", updatedAt });

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ event: { status: "planned" } });
    expect(await statusOf(id)).toBe("planned");
  });

  it("moved later today but still before now, it stays done", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, DONE);

    await edit(id, { title: "Study", start: "2026-11-16T07:30", end: "2026-11-16T08:30", updatedAt });

    expect(await statusOf(id)).toBe("done");
  });

  it("moved to start exactly now, it stays done (the start moment counts as started)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, DONE);

    await edit(id, { title: "Study", start: "2026-11-16T09:00", end: "2026-11-16T10:00", updatedAt });

    expect(await statusOf(id)).toBe("done");
  });

  it("only the title changes: it stays done", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, DONE);

    await edit(id, { title: "Study maths", start: "2026-11-16T07:00", end: "2026-11-16T08:00", updatedAt });

    expect(await statusOf(id)).toBe("done");
  });

  it("this and following of a series: each done event that now starts in the future is planned, the others stay", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const created = await read(await createEvent(postJson("/api/events", { title: "Run", start: "2026-11-14T07:00", end: "2026-11-14T08:00", repeat: { frequency: "daily", until: "2026-11-17" } }), app.deps));
    expect(created.status).toBe(201);
    await app.db.admin("update app.events set status = 'done' where user_id = $1 and start_at < '2026-11-16T09:00:00Z'", [alice]);
    const rows = await app.db.admin<{ id: string; updated_at: Date }>("select id, updated_at from app.events where user_id = $1 order by start_at", [alice]);
    expect(await Promise.all(rows.map((r) => statusOf(r.id)))).toEqual(["done", "done", "done", "planned"]);

    // From the 15th on, 10:00 instead of 07:00: the 15th stays in the past, the 16th moves past now.
    const [, second] = rows;
    const answer = await edit(second.id, { title: "Run", start: "2026-11-15T10:00", end: "2026-11-15T11:00", updatedAt: new Date(second.updated_at).toISOString(), scope: "this_and_following" });

    expect(answer.status).toBe(200);
    expect(await Promise.all(rows.map((r) => statusOf(r.id)))).toEqual(["done", "done", "planned", "planned"]);
  });

  it("another user's done event is not touched", async () => {
    const bob = await app.signedInAs("bob@example.com", { timeZone: "Europe/Lisbon" });
    const bobs = await seedEvent(app.db, bob, DONE);
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, DONE);

    await edit(id, { title: "Study", start: "2026-11-17T07:00", end: "2026-11-17T08:00", updatedAt });

    expect(await statusOf(bobs.id)).toBe("done");
  });
});
