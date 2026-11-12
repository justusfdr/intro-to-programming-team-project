// Tests for a goal's look (spec 13; ontology section 5 create_goal and edit_goal, R35): colour and icon
// only from the ten of each, "why it matters" up to 200 characters, left-out fields keep their value,
// and the goals panel's colour falls back to the calculated one. Same pattern as create-goal.test.ts:
// each rejected case checks the exact answer and that nothing changed.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { HALF_MARATHON, seedGoal } from "@test/support/goals";
import { loadGoals } from "@/lib/server/goals/load";
import { createGoal } from "./create-goal";
import { editGoal } from "./edit-goal";

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

const create = (body: unknown) => createGoal(postJson("/api/goals", body), app.deps);
const edit = (id: string, body: unknown) => editGoal(postJson(`/api/goals/${id}/edit`, body), app.deps, id);

async function lookOf(goalId: string) {
  const [row] = await app.db.admin("select color, icon, why, demo from app.goals where id = $1", [goalId]);
  return row;
}

const SEED = { deadline: "2027-03-14", rules: [{ kind: "count" as const, target: 2, minMinutes: 45 }] };

describe("create_goal with a look", () => {
  it("saves colour, icon and a trimmed why, and answers with them", async () => {
    await app.signedInAs("alice@example.com");
    const answer = await read(
      await create({ ...HALF_MARATHON, color: "teal", icon: "footprints", why: "  Stay fit, even when the semester gets busy.  " }),
    );
    expect(answer.status).toBe(201);
    const goal = answer.body.goal as { id: string };
    expect(answer.body.goal).toMatchObject({ color: "teal", icon: "footprints", why: "Stay fit, even when the semester gets busy." });
    expect(await lookOf(goal.id)).toEqual({ color: "teal", icon: "footprints", why: "Stay fit, even when the semester gets busy.", demo: false });
  });

  it("without a look: no saved colour (calculated), the rocket icon, an empty why", async () => {
    await app.signedInAs("alice@example.com");
    const answer = await read(await create(HALF_MARATHON));
    const goal = answer.body.goal as { id: string };
    expect(answer.body.goal).toMatchObject({ color: null, icon: "rocket", why: "" });
    expect(await lookOf(goal.id)).toEqual({ color: null, icon: "rocket", why: "", demo: false });
  });

  it("accepts each of the ten colours and ten icons, and a why of exactly 200 characters", async () => {
    await app.signedInAs("alice@example.com");
    const colors = ["rose", "teal", "indigo", "amber", "emerald", "pink", "sky", "violet", "orange", "slate"];
    const icons = ["rocket", "footprints", "heart", "video", "book", "dumbbell", "briefcase", "graduation", "palette", "code"];
    for (let i = 0; i < 10; i++) {
      const answer = await create({ ...HALF_MARATHON, color: colors[i], icon: icons[i], why: i === 0 ? "w".repeat(200) : "" });
      expect(answer.status, `${colors[i]} ${icons[i]}`).toBe(201);
    }
  });

  it("does not let the body mark a goal as demo", async () => {
    await app.signedInAs("alice@example.com");
    const answer = await read(await create({ ...HALF_MARATHON, demo: true }));
    expect((await lookOf((answer.body.goal as { id: string }).id)).demo).toBe(false);
  });
});

describe("create_goal and edit_goal rejected for the look: nothing is saved (R1)", () => {
  it.each([
    ["a colour outside the list", { color: "lime" }, "goal_color", "Choose a color from the list"],
    ["a colour name in capitals", { color: "Rose" }, "goal_color", "Choose a color from the list"],
    ["an empty colour", { color: "" }, "goal_color", "Choose a color from the list"],
    ["an icon outside the list", { icon: "target" }, "goal_icon", "Choose an icon from the list"],
    ["an empty icon", { icon: "" }, "goal_icon", "Choose an icon from the list"],
    ["a why of 201 characters", { why: "w".repeat(201) }, "why_length", "Why it matters can be at most 200 characters"],
  ])("create rejects %s", async (_case, change, error, message) => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await create({ ...HALF_MARATHON, ...change }))).toEqual({ status: 400, body: { error, message } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("edit rejects a colour, an icon or a why outside the rules, and keeps the goal as it was", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, SEED);
    const before = await app.snapshot();
    for (const [change, message] of [
      [{ color: "black" }, "Choose a color from the list"],
      [{ icon: "star" }, "Choose an icon from the list"],
      [{ why: "w".repeat(201) }, "Why it matters can be at most 200 characters"],
    ] as const) {
      const answer = await read(await edit(g.id, { ...HALF_MARATHON, ...change, updatedAt: g.updatedAt }));
      expect(answer.body.message).toBe(message);
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("names the title before the look, in the ontology's order", async () => {
    await app.signedInAs("alice@example.com");
    const answer = await read(await create({ ...HALF_MARATHON, title: "", color: "lime" }));
    expect(answer.body.message).toBe("Title must be 1 to 80 characters");
  });

  it("refuses a colour of the wrong type with 400", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect((await create({ ...HALF_MARATHON, color: 3 })).status).toBe(400);
    expect((await create({ ...HALF_MARATHON, why: ["a"] })).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("edit_goal and the look", () => {
  it("changes colour, icon and why", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, SEED);
    const answer = await read(await edit(g.id, { ...HALF_MARATHON, color: "indigo", icon: "code", why: "Real users.", updatedAt: g.updatedAt }));
    expect(answer.status).toBe(200);
    expect(await lookOf(g.id)).toEqual({ color: "indigo", icon: "code", why: "Real users.", demo: false });
  });

  it("keeps colour, icon and why when the body leaves them out (an older device)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, SEED);
    await app.db.admin("update app.goals set color = 'pink', icon = 'heart', why = 'For me.' where id = $1", [g.id]);
    const [{ updated_at }] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.goals where id = $1", [g.id]);
    const answer = await read(await edit(g.id, { ...HALF_MARATHON, updatedAt: new Date(updated_at).toISOString() }));
    expect(answer.status).toBe(200);
    expect(await lookOf(g.id)).toEqual({ color: "pink", icon: "heart", why: "For me.", demo: false });
  });

  it("a colour of null goes back to the calculated colour", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, SEED);
    await app.db.admin("update app.goals set color = 'pink' where id = $1", [g.id]);
    const [{ updated_at }] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.goals where id = $1", [g.id]);
    await edit(g.id, { ...HALF_MARATHON, color: null, updatedAt: new Date(updated_at).toISOString() });
    expect((await lookOf(g.id)).color).toBeNull();
  });

  it("an empty why clears it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, SEED);
    await edit(g.id, { ...HALF_MARATHON, why: "First", updatedAt: g.updatedAt });
    const [{ updated_at }] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.goals where id = $1", [g.id]);
    await edit(g.id, { ...HALF_MARATHON, why: "   ", updatedAt: new Date(updated_at).toISOString() });
    expect((await lookOf(g.id)).why).toBe("");
  });
});

describe("the goals panel's look", () => {
  it("shows a saved colour, and the calculated one (rose, teal, violet, …) for a goal without", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const first = await seedGoal(app.db, alice, { ...SEED, title: "First", createdAt: "2026-11-02T10:00:00Z" });
    await seedGoal(app.db, alice, { ...SEED, title: "Second", createdAt: "2026-11-03T10:00:00Z" });
    await seedGoal(app.db, alice, { ...SEED, title: "Third", createdAt: "2026-11-04T10:00:00Z" });
    await app.db.admin("update app.goals set color = 'orange', icon = 'book' where id = $1", [first.id]);

    const goals = await loadGoals(app.deps, alice);

    expect(goals.map((g) => [g.title, g.color, g.look])).toEqual([
      ["First", "orange", { color: "orange", icon: "book" }],
      ["Second", null, { color: "teal", icon: "rocket" }],
      ["Third", null, { color: "violet", icon: "rocket" }],
    ]);
  });
});
