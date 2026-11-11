// Tests for remove_rule (spec 03, What lines 1 to 3; ontology section 5, R1, R3, R4). Same pattern as
// edit-goal.test.ts: the accepted case checks what is saved; each rejected case checks the exact
// answer and that nothing changed, with app.snapshot() before and after. The two-device case (R4) is two requests.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { goalsOf, seedGoal } from "@test/support/goals";
import { removeRule } from "./remove-rule";

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

function send(ruleId: string, body: unknown, headers?: Record<string, string>) {
  return removeRule(postJson(`/api/rules/${ruleId}/remove`, body, headers), app.deps, ruleId);
}

const BODY_FOR = (g: { updatedAt: string }) => ({ updatedAt: g.updatedAt });

/** The id of a goal's rule of this kind, as the database holds it. */
async function ruleIdOf(goalId: string, kind: string): Promise<string> {
  const [row] = await app.db.admin<{ id: string }>("select id from app.rules where goal_id = $1 and kind = $2", [goalId, kind]);
  return row.id;
}

describe("remove_rule accepted", () => {
  it("deletes one of two rules, the other stays; the goal's updatedAt grows; answers 200 'Rule removed.' with the goal", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, {
      deadline: "2027-03-14",
      rules: [
        { kind: "count", target: 2, minMinutes: 45 },
        { kind: "hours", target: 3 },
      ],
    });

    const answer = await read(await send(await ruleIdOf(g.id, "hours"), { updatedAt: g.updatedAt }));

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      message: "Rule removed.",
      goal: { id: g.id, rules: [{ kind: "count", target: 2, minMinutes: 45 }] },
    });
    expect(await goalsOf(app.db, alice)).toMatchObject([{ rules: [{ kind: "count", target: 2, min_minutes: 45 }] }]);
    const [{ updated_at }] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.goals where id = $1", [g.id]);
    expect(new Date(updated_at).getTime()).toBeGreaterThan(Date.parse(g.updatedAt));
  });
});

describe("remove_rule rejected: nothing is changed (R1)", () => {
  it("rejects removing the last rule: 409 'A goal needs at least one rule'; app.snapshot() unchanged", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    const before = await app.snapshot();

    const answer = await read(await send(g.ruleIds[0], BODY_FOR(g)));

    expect(answer).toEqual({ status: 409, body: { error: "last_rule", message: "A goal needs at least one rule" } });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("remove_rule: 'Not found' for another user's rule (R3)", () => {
  it("answers exactly the same 'Not found' for another user's goal, a missing goal and a malformed id, and changes nothing (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedGoal(app.db, bob, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    const othersGoal = await read(await send(bobs.ruleIds[0], BODY_FOR(bobs)));
    const missing = await read(await send("00000000-0000-4000-8000-000000000000", BODY_FOR(bobs)));
    const malformed = await read(await send("not-a-uuid", BODY_FOR(bobs)));

    expect(othersGoal).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(missing).toEqual(othersGoal);
    expect(malformed).toEqual(othersGoal);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("remove_rule: two devices (R4)", () => {
  it("a remove with an older goal updatedAt answers 409 'Changed on another device. Reload to see the latest version'; both rules stay", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, {
      deadline: "2027-03-14",
      rules: [
        { kind: "count", target: 2, minMinutes: 45 },
        { kind: "hours", target: 3 },
      ],
    });
    // The laptop changes the goal first, so the goal now has a newer updated_at than the desktop saw.
    await app.db.admin("update app.goals set title = $2 where id = $1", [g.id, "Laptop title"]);

    const desktop = await read(await send(await ruleIdOf(g.id, "hours"), { updatedAt: g.updatedAt }));

    expect(desktop).toEqual({
      status: 409,
      body: { error: "changed_elsewhere", message: "Changed on another device. Reload to see the latest version" },
    });
    expect(await goalsOf(app.db, alice)).toMatchObject([
      { title: "Laptop title", rules: [{ kind: "count", target: 2 }, { kind: "hours", target: 3 }] },
    ]);
  });
});

describe("remove_rule: sign-in and same-origin checks (R3)", () => {
  it("answers 401 without a session and changes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, {
      deadline: "2027-03-14",
      rules: [
        { kind: "count", target: 2, minMinutes: 45 },
        { kind: "hours", target: 3 },
      ],
    });
    await app.reset(); // no session now; the goal is removed too, which is fine for this check
    const before = await app.snapshot();

    const answer = await read(await send("00000000-0000-4000-8000-000000000000", { updatedAt: g.updatedAt }));

    expect(answer).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a request from another site (403) and changes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, {
      deadline: "2027-03-14",
      rules: [
        { kind: "count", target: 2, minMinutes: 45 },
        { kind: "hours", target: 3 },
      ],
    });
    const before = await app.snapshot();

    const response = await send(await ruleIdOf(g.id, "hours"), BODY_FOR(g), { origin: "https://evil.example", "sec-fetch-site": "cross-site" });

    expect(response.status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
  });
});
