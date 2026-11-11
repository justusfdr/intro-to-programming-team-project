// Tests for create_goal (spec 03, What lines 1 to 3). Same pattern as create-event.test.ts:
// the accepted case checks every saved field; each rejected case checks the exact message and that
// nothing changed, with app.snapshot() before and after.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { goalsOf, HALF_MARATHON } from "@test/support/goals";
import { createGoal } from "./create-goal";

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
  return createGoal(postJson("/api/goals", body, headers), app.deps);
}

describe("create_goal accepted", () => {
  it("saves 'Run a half marathon' with its rule together, auto_block false", async () => {
    const alice = await app.signedInAs("alice@example.com");

    const answer = await read(await send(HALF_MARATHON));

    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({
      message: "Goal saved.",
      goal: {
        title: "Run a half marathon",
        deadline: "2027-03-14",
        autoBlock: false,
        rules: [{ kind: "count", target: 2, minMinutes: 45 }],
      },
    });
    expect(await goalsOf(app.db, alice)).toMatchObject([
      { title: "Run a half marathon", deadline: "2027-03-14", auto_block: false, rules: [{ kind: "count", target: 2, min_minutes: 45 }] },
    ]);
  });

  it("saves auto_block when switched on, several rules, and the limits of R7", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const rules = [
      { kind: "count", target: 1, minMinutes: 15 },
      { kind: "count", target: 14, minMinutes: 240 },
      { kind: "hours", target: 0.5 },
      { kind: "hours", target: 60, minMinutes: null },
    ];
    expect((await send({ ...HALF_MARATHON, autoBlock: true, rules })).status).toBe(201);
    const [goal] = await goalsOf(app.db, alice);
    expect(goal).toMatchObject({ auto_block: true });
    expect(goal.rules).toHaveLength(4);
  });

  it("accepts today as deadline and trims the title", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    expect((await send({ ...HALF_MARATHON, title: "  Read 20 books  ", deadline: "2026-11-16" })).status).toBe(201);
    expect(await goalsOf(app.db, alice)).toMatchObject([{ title: "Read 20 books", deadline: "2026-11-16" }]);
  });

  it("saves the goal for the signed-in user only", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com");
    await send(HALF_MARATHON);
    expect(await goalsOf(app.db, alice)).toHaveLength(1);
    expect(await goalsOf(app.db, bob)).toEqual([]);
  });
});

describe("create_goal rejected: nothing is saved (R1)", () => {
  const count = (target: number, minMinutes: number | null = null) => [{ kind: "count", target, minMinutes }];
  const hours = (target: number) => [{ kind: "hours", target }];

  it.each([
    ["an empty title", { title: "" }, "title_length", "Title must be 1 to 80 characters"],
    ["a title of only spaces", { title: "   " }, "title_length", "Title must be 1 to 80 characters"],
    ["an 81-character title", { title: "x".repeat(81) }, "title_length", "Title must be 1 to 80 characters"],
    ["no rule", { rules: [] }, "no_rule", "Add at least one rule"],
    ["yesterday as deadline", { deadline: "2026-11-15" }, "deadline_past", "The deadline cannot be in the past"],
    ["count 0", { rules: count(0) }, "count_target", "Target must be 1 to 14 events"],
    ["count 15", { rules: count(15) }, "count_target", "Target must be 1 to 14 events"],
    ["count 2.5", { rules: count(2.5) }, "count_target", "Target must be 1 to 14 events"],
    ["hours 0", { rules: hours(0) }, "hours_target", "Target must be 0.5 to 60 hours"],
    ["hours 60.5", { rules: hours(60.5) }, "hours_target", "Target must be 0.5 to 60 hours"],
    ["hours 1.3 (not a step of 0.5)", { rules: hours(1.3) }, "hours_target", "Target must be 0.5 to 60 hours"],
    ["min_minutes 14", { rules: count(2, 14) }, "min_minutes", "Minimum length must be 15 to 240 minutes"],
    ["min_minutes 241", { rules: count(2, 241) }, "min_minutes", "Minimum length must be 15 to 240 minutes"],
    ["one good and one bad rule", { rules: [...count(2), ...hours(61)] }, "hours_target", "Target must be 0.5 to 60 hours"],
  ])("rejects %s", async (_case, change, error, message) => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    const answer = await read(await send({ ...HALF_MARATHON, ...change }));

    expect(answer).toEqual({ status: 400, body: { error, message } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("judges 'the past' by the user's own calendar: 16 November is already yesterday in Auckland", async () => {
    app.advance(4 * 3_600_000); // 13:00 UTC = Tuesday 17 November, 02:00 in Auckland
    await app.signedInAs("kiri@example.com", { timeZone: "Pacific/Auckland" });
    const answer = await read(await send({ ...HALF_MARATHON, deadline: "2026-11-16" }));
    expect(answer.body.message).toBe("The deadline cannot be in the past");
  });

  it("names the first problem in the ontology's order: title before rules before deadline", async () => {
    await app.signedInAs("alice@example.com");
    const answer = await read(await send({ ...HALF_MARATHON, title: "", rules: [], deadline: "2020-01-01" }));
    expect(answer.body.message).toBe("Title must be 1 to 80 characters");
  });

  it("rejects bodies of the wrong shape with 400: no date, no rules list, a minimum on an hours rule, 11 rules", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    for (const body of [
      { ...HALF_MARATHON, deadline: "next week" },
      { ...HALF_MARATHON, rules: undefined },
      { ...HALF_MARATHON, rules: [{ kind: "hours", target: 2, minMinutes: 30 }] },
      { ...HALF_MARATHON, rules: Array.from({ length: 11 }, () => HALF_MARATHON.rules[0]) },
      { ...HALF_MARATHON, rules: [{ kind: "days", target: 2 }] },
    ]) {
      expect((await send(body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 401 without a session and 403 from another site; nothing saved", async () => {
    const before = await app.snapshot();
    expect(await read(await send(HALF_MARATHON))).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);

    await app.signedInAs("alice@example.com");
    const signedIn = await app.snapshot();
    expect((await send(HALF_MARATHON, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(await app.snapshot()).toEqual(signedIn);
  });
});
