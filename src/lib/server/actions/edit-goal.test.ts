// Tests for edit_goal (spec 03, What line "edit_goal"; ontology section 5, R3, R4, R7). Same pattern as
// create-goal.test.ts: the accepted case checks every saved field; each rejected case checks the exact
// answer and that nothing changed, with app.snapshot() before and after. The two-device case (R4) is two requests.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { goalsOf, HALF_MARATHON, seedGoal } from "@test/support/goals";
import { editGoal } from "./edit-goal";

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
  return editGoal(postJson(`/api/goals/${id}/edit`, body, headers), app.deps, id);
}

// A goal as the device saw it: "Run a half marathon", one rule of 2 runs of at least 45 minutes a week.
const SEED = { title: "Run a half marathon", deadline: "2027-03-14", rules: [{ kind: "count" as const, target: 2, minMinutes: 45 }] };

const BODY_FOR = (g: { updatedAt: string }) => ({ ...HALF_MARATHON, updatedAt: g.updatedAt });

/** The rules of a goal as the database holds them, with their ids, count rules first. */
async function ruleRowsOf(goalId: string): Promise<{ id: string; kind: string }[]> {
  return app.db.admin<{ id: string; kind: string }>("select id, kind from app.rules where goal_id = $1 order by kind, id", [goalId]);
}

describe("edit_goal accepted", () => {
  it("changes title, deadline and auto_block; changes one rule, adds one, removes one, all in one step; updated_at grows; answers 200 'Goal saved.' with the new goal", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, {
      title: "Run a half marathon",
      deadline: "2027-03-14",
      rules: [
        { kind: "count", target: 2, minMinutes: 45 },
        { kind: "hours", target: 3 },
      ],
    });
    const [count] = await ruleRowsOf(g.id); // the count rule comes first; the hours rule is removed

    const answer = await read(
      await send(g.id, {
        title: "Run a half marathon in March",
        deadline: "2027-03-21",
        autoBlock: true,
        rules: [
          { id: count.id, kind: "count", target: 3, minMinutes: 30 }, // changed
          { kind: "hours", target: 1.5 }, // added
        ], // the old hours rule is left out, so it is removed
        updatedAt: g.updatedAt,
      }),
    );

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      message: "Goal saved.",
      goal: {
        id: g.id,
        title: "Run a half marathon in March",
        deadline: "2027-03-21",
        autoBlock: true,
        rules: [
          { kind: "count", target: 3, minMinutes: 30 },
          { kind: "hours", target: 1.5, minMinutes: null },
        ],
      },
    });
    expect(await goalsOf(app.db, alice)).toMatchObject([
      {
        title: "Run a half marathon in March",
        deadline: "2027-03-21",
        auto_block: true,
        rules: [
          { kind: "count", target: 3, min_minutes: 30 },
          { kind: "hours", target: 1.5, min_minutes: null },
        ],
      },
    ]);
    const [{ updated_at }] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.goals where id = $1", [g.id]);
    expect(new Date(updated_at).getTime()).toBeGreaterThan(Date.parse(g.updatedAt));
  });

  it("keeps an unchanged past deadline (seeded 2026-11-01; only the title changes: 200)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, { ...SEED, deadline: "2026-11-01" });
    const [count] = await ruleRowsOf(g.id);

    const answer = await read(
      await send(g.id, {
        title: "Run a half marathon, again",
        deadline: "2026-11-01",
        rules: [{ id: count.id, kind: "count", target: 2, minMinutes: 45 }],
        updatedAt: g.updatedAt,
      }),
    );

    expect(answer.status).toBe(200);
    expect(await goalsOf(app.db, alice)).toMatchObject([{ title: "Run a half marathon, again", deadline: "2026-11-01" }]);
  });
});

describe("edit_goal rejected: nothing is changed (R1)", () => {
  it.each([
    ["an empty title", { title: "" }, "title_length", "Title must be 1 to 80 characters"],
    ["an 81-character title", { title: "x".repeat(81) }, "title_length", "Title must be 1 to 80 characters"],
    ["no rule", { rules: [] }, "no_rule", "Add at least one rule"],
    ["count 15", { rules: [{ kind: "count", target: 15, minMinutes: null }] }, "count_target", "Target must be 1 to 14 events"],
    ["hours 60.5", { rules: [{ kind: "hours", target: 60.5 }] }, "hours_target", "Target must be 0.5 to 60 hours"],
    ["min_minutes 241", { rules: [{ kind: "count", target: 2, minMinutes: 241 }] }, "min_minutes", "Minimum length must be 15 to 240 minutes"],
  ])("rejects %s", async (_case, change, error, message) => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, SEED);
    const before = await app.snapshot();

    const answer = await read(await send(g.id, { ...BODY_FOR(g), ...change }));

    expect(answer).toEqual({ status: 400, body: { error, message } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects changing the deadline to another past day: 'The deadline cannot be in the past'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, SEED);
    const before = await app.snapshot();

    const answer = await read(await send(g.id, { ...BODY_FOR(g), deadline: "2026-11-01" }));

    expect(answer).toEqual({ status: 400, body: { error: "deadline_past", message: "The deadline cannot be in the past" } });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("edit_goal: 'Not found' for another user's goal (R3)", () => {
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

  it("a rule id of another of the user's goals, or of Bob's goal, in the rules list answers 'Not found'; nothing changed", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const mine = await seedGoal(app.db, alice, SEED);
    const other = await seedGoal(app.db, alice, { title: "Read 20 books", deadline: "2027-06-30", rules: [{ kind: "count", target: 1 }] });
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedGoal(app.db, bob, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    const withRule = (ruleId: string) => ({
      title: "Run a half marathon",
      deadline: "2027-03-14",
      rules: [{ id: ruleId, kind: "count", target: 2, minMinutes: 45 }],
      updatedAt: mine.updatedAt,
    });
    const ownOtherGoal = await read(await send(mine.id, withRule(other.ruleIds[0])));
    const bobsRule = await read(await send(mine.id, withRule(bobs.ruleIds[0])));

    expect(ownOtherGoal).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(bobsRule).toEqual(ownOtherGoal);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("edit_goal: two devices (R4)", () => {
  it("the laptop's save stays; a save with the old updated_at is rejected with 'Changed on another device. Reload to see the latest version'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, SEED);
    const [count] = await ruleRowsOf(g.id);
    const body = (title: string) => ({
      title,
      deadline: "2027-03-14",
      rules: [{ id: count.id, kind: "count", target: 2, minMinutes: 45 }],
      updatedAt: g.updatedAt, // both devices saw this version
    });

    expect((await read(await send(g.id, body("Laptop title")))).status).toBe(200);
    const desktop = await read(await send(g.id, body("Desktop title")));

    expect(desktop).toEqual({
      status: 409,
      body: { error: "changed_elsewhere", message: "Changed on another device. Reload to see the latest version" },
    });
    expect(await goalsOf(app.db, alice)).toMatchObject([{ title: "Laptop title" }]);
  });
});

describe("edit_goal: sign-in and same-origin checks (R3)", () => {
  it("answers 401 without a session and changes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, SEED);
    await app.reset(); // no session now; the goal is removed too, which is fine for this check
    const before = await app.snapshot();

    const answer = await read(await send("00000000-0000-4000-8000-000000000000", { ...HALF_MARATHON, updatedAt: g.updatedAt }));

    expect(answer).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a request from another site (403) and changes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, SEED);
    const before = await app.snapshot();
    const response = await send(g.id, BODY_FOR(g), { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
  });
});
