// Tests for a goal's routine in create_goal and edit_goal (spec 41; ontology section 5, R1, R3, R4, R44):
// each new field accepted and each message rejected with nothing changed; fields an edit leaves out keep
// their values and null clears them; the own word for "other" is dropped with another category; the week
// must still fit (R44) on create, on an edit of the rules alone and on an edit of the days alone; the
// answer carries "routine" only when something is set. Same pattern as goal-look.test.ts.
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

const SEED = { deadline: "2027-03-14", rules: [{ kind: "count" as const, target: 2, minMinutes: 45 }] };

const FULL = {
  category: "other",
  categoryOther: "  Music  ",
  sessionMinutes: 60,
  dayPart: "evening",
  avoidDays: [7, 6],
  location: "  Studio 4, Lisbon  ",
};

async function routineRow(goalId: string) {
  const [row] = await app.db.admin(
    "select category, category_other, session_minutes, day_part, avoid_days, location from app.goals where id = $1",
    [goalId],
  );
  return row;
}

const EMPTY_ROW = { category: null, category_other: null, session_minutes: null, day_part: null, avoid_days: "", location: null };

async function updatedAtOf(goalId: string): Promise<string> {
  const [{ updated_at }] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.goals where id = $1", [goalId]);
  return new Date(updated_at).toISOString();
}

/** A goal of Alice's with a routine already saved, and the updatedAt to edit it with. */
async function seedWithRoutine(alice: string, set = "category = 'other', category_other = 'Music', session_minutes = 60, day_part = 'evening', avoid_days = '67', location = 'Studio'") {
  const g = await seedGoal(app.db, alice, SEED);
  await app.db.admin(`update app.goals set ${set} where id = $1`, [g.id]);
  return { id: g.id, updatedAt: await updatedAtOf(g.id) };
}

describe("create_goal with a routine", () => {
  it("saves every field cleaned (trimmed, days sorted) and answers with exactly the allowed keys", async () => {
    await app.signedInAs("alice@example.com");
    const answer = await read(await create({ ...HALF_MARATHON, ...FULL }));
    expect(answer.status).toBe(201);
    const goal = answer.body.goal as Record<string, unknown>;
    expect(await routineRow(goal.id as string)).toEqual({
      category: "other",
      category_other: "Music",
      session_minutes: 60,
      day_part: "evening",
      avoid_days: "67",
      location: "Studio 4, Lisbon",
    });
    expect(Object.keys(goal).sort()).toEqual(["autoBlock", "color", "deadline", "icon", "id", "routine", "rules", "title", "updatedAt", "why"]);
    expect(goal.routine).toEqual({
      category: "other",
      categoryOther: "Music",
      sessionMinutes: 60,
      dayPart: "evening",
      avoidDays: [6, 7],
      mustDays: [],
      dayFrom: null,
      dayUntil: null,
      location: "Studio 4, Lisbon",
    });
    expect(goal.deadline).toBe("2027-03-14");
  });

  it("without a routine: the defaults, and no routine key in the answer or on the page", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const answer = await read(await create(HALF_MARATHON));
    const goal = answer.body.goal as Record<string, unknown>;
    expect(await routineRow(goal.id as string)).toEqual(EMPTY_ROW);
    expect(Object.keys(goal).sort()).toEqual(["autoBlock", "color", "deadline", "icon", "id", "rules", "title", "updatedAt", "why"]);
    expect("routine" in (await loadGoals(app.deps, alice))[0]).toBe(false);
  });

  it("an answer with only one field set carries the whole routine with the others empty", async () => {
    await app.signedInAs("alice@example.com");
    const answer = await read(await create({ ...HALF_MARATHON, avoidDays: [5] }));
    expect((answer.body.goal as { routine: unknown }).routine).toEqual({
      category: null,
      categoryOther: null,
      sessionMinutes: null,
      dayPart: null,
      avoidDays: [5],
      mustDays: [],
      dayFrom: null,
      dayUntil: null,
      location: null,
    });
  });

  it("accepts each category, 15 and 240 minutes, each part of the day, six avoided days and 200 characters of location", async () => {
    await app.signedInAs("alice@example.com");
    for (const change of [
      { category: "sport" },
      { category: "uni" },
      { category: "work" },
      { category: "personal" },
      { category: "other", categoryOther: "m".repeat(30) },
      { sessionMinutes: 15 },
      { sessionMinutes: 240 },
      { dayPart: "morning" },
      { dayPart: "afternoon" },
      { dayPart: "evening" },
      { avoidDays: [1, 2, 3, 4, 5, 6], rules: [{ kind: "count", target: 2 }] },
      { location: "l".repeat(200) },
    ]) {
      expect((await create({ ...HALF_MARATHON, ...change })).status, JSON.stringify(change).slice(0, 60)).toBe(201);
    }
  });

  it("drops an own word sent with another category, and an empty own word or location means none", async () => {
    await app.signedInAs("alice@example.com");
    const sport = await read(await create({ ...HALF_MARATHON, category: "sport", categoryOther: "Music" }));
    expect(await routineRow((sport.body.goal as { id: string }).id)).toMatchObject({ category: "sport", category_other: null });
    const blank = await read(await create({ ...HALF_MARATHON, category: "other", categoryOther: "   ", location: "  " }));
    expect(await routineRow((blank.body.goal as { id: string }).id)).toMatchObject({ category: "other", category_other: null, location: null });
  });
});

const REJECTED: [string, Record<string, unknown>, string, string][] = [
  ["a category outside the list", { category: "music" }, "goal_category", "Choose a category from the list"],
  ["an own word of 31 characters", { category: "other", categoryOther: "m".repeat(31) }, "category_other_length", "Your own category can be at most 30 characters"],
  ["an own word with a line break", { category: "other", categoryOther: "Mu\nsic" }, "category_other_form", "Your own category must be on one line, without control characters"],
  ["0 minutes", { sessionMinutes: 0 }, "session_minutes", "A session lasts 1 minute to 12 hours"],
  ["721 minutes", { sessionMinutes: 721 }, "session_minutes", "A session lasts 1 minute to 12 hours"],
  ["a part of the day outside the list", { dayPart: "night" }, "day_part", "Choose morning, afternoon, evening or any time"],
  ["a day 8", { avoidDays: [8] }, "avoid_days", "Choose weekdays from the list"],
  ["a day twice", { avoidDays: [5, 5] }, "avoid_days", "Choose weekdays from the list"],
  ["all seven days", { avoidDays: [1, 2, 3, 4, 5, 6, 7] }, "avoid_all_days", "A goal needs at least one day of the week"],
  ["a location of 201 characters", { location: "l".repeat(201) }, "location_length", "Location can be at most 200 characters"],
];

describe("create_goal and edit_goal rejected for the routine: nothing is saved (R1)", () => {
  it.each(REJECTED)("create rejects %s", async (_case, change, error, message) => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await create({ ...HALF_MARATHON, ...change }))).toEqual({ status: 400, body: { error, message } });
    expect(await app.snapshot()).toEqual(before);
  });

  it.each(REJECTED)("edit rejects %s and keeps the goal as it was", async (_case, change, error, message) => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedWithRoutine(alice);
    const before = await app.snapshot();
    expect(await read(await edit(g.id, { ...HALF_MARATHON, ...change, updatedAt: g.updatedAt }))).toEqual({ status: 400, body: { error, message } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("refuses bodies of the wrong shape with 400 and saves nothing", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    for (const change of [
      { category: 3 },
      { sessionMinutes: "60" },
      { dayPart: ["morning"] },
      { avoidDays: [1, 2, 3, 4, 5, 6, 7, 1] },
      { avoidDays: "67" },
      { avoidDays: ["6"] },
      { location: { street: "x" } },
      { categoryOther: "m".repeat(1001) },
    ]) {
      expect(await read(await create({ ...HALF_MARATHON, ...change })), JSON.stringify(change).slice(0, 60)).toEqual({
        status: 400,
        body: { error: "bad_request", message: "Invalid request." },
      });
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("names the look before the routine, in the ontology's order", async () => {
    await app.signedInAs("alice@example.com");
    const answer = await read(await create({ ...HALF_MARATHON, icon: "star", category: "music" }));
    expect(answer.body.message).toBe("Choose an icon from the list");
  });
});

describe("edit_goal and the routine", () => {
  it("keeps every routine field when the body leaves them out (the editor of today, an older device)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedWithRoutine(alice);
    const answer = await read(await edit(g.id, { ...HALF_MARATHON, title: "Band practice", updatedAt: g.updatedAt }));
    expect(answer.status).toBe(200);
    expect(await routineRow(g.id)).toEqual({
      category: "other",
      category_other: "Music",
      session_minutes: 60,
      day_part: "evening",
      avoid_days: "67",
      location: "Studio",
    });
    expect((answer.body.goal as { routine: unknown }).routine).toMatchObject({ categoryOther: "Music", avoidDays: [6, 7] });
  });

  it("changes the fields that are sent and keeps the others", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedWithRoutine(alice);
    await edit(g.id, { ...HALF_MARATHON, sessionMinutes: 90, avoidDays: [1], updatedAt: g.updatedAt });
    expect(await routineRow(g.id)).toEqual({
      category: "other",
      category_other: "Music",
      session_minutes: 90,
      day_part: "evening",
      avoid_days: "1",
      location: "Studio",
    });
  });

  it("null clears each field and an empty list clears the days; then the answer has no routine", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedWithRoutine(alice);
    const answer = await read(
      await edit(g.id, {
        ...HALF_MARATHON,
        category: null,
        categoryOther: null,
        sessionMinutes: null,
        dayPart: null,
        avoidDays: [],
        location: null,
        updatedAt: g.updatedAt,
      }),
    );
    expect(answer.status).toBe(200);
    expect(await routineRow(g.id)).toEqual(EMPTY_ROW);
    expect("routine" in (answer.body.goal as object)).toBe(false);
  });

  it("null days clear them too, and an empty location clears it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedWithRoutine(alice);
    await edit(g.id, { ...HALF_MARATHON, avoidDays: null, location: "  ", updatedAt: g.updatedAt });
    expect(await routineRow(g.id)).toMatchObject({ avoid_days: "", location: null });
  });

  it("switching to another category drops the saved own word; keeping 'other' keeps it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedWithRoutine(alice);
    await edit(g.id, { ...HALF_MARATHON, categoryOther: "Piano", updatedAt: g.updatedAt });
    expect(await routineRow(g.id)).toMatchObject({ category: "other", category_other: "Piano" });
    await edit(g.id, { ...HALF_MARATHON, category: "uni", updatedAt: await updatedAtOf(g.id) });
    expect(await routineRow(g.id)).toMatchObject({ category: "uni", category_other: null });
    // An own word sent while the kept category is not "other" is dropped as well.
    await edit(g.id, { ...HALF_MARATHON, categoryOther: "Piano", updatedAt: await updatedAtOf(g.id) });
    expect(await routineRow(g.id)).toMatchObject({ category: "uni", category_other: null });
  });

  it("another user's goal is 'Not found' with the new fields as well, and is not changed (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const theirs = await seedWithRoutine(bob);
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    const answer = await read(await edit(theirs.id, { ...HALF_MARATHON, ...FULL, category: "work", updatedAt: theirs.updatedAt }));
    expect(answer).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("an edit with an older updatedAt is refused and changes nothing (R4)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedWithRoutine(alice);
    expect((await edit(g.id, { ...HALF_MARATHON, sessionMinutes: 30, updatedAt: g.updatedAt })).status).toBe(200);
    const before = await app.snapshot();
    const stale = await read(await edit(g.id, { ...HALF_MARATHON, sessionMinutes: 45, updatedAt: g.updatedAt }));
    expect(stale).toEqual({ status: 409, body: { error: "changed_elsewhere", message: "Changed on another device. Reload to see the latest version" } });
    expect(await app.snapshot()).toEqual(before);
    expect(await routineRow(g.id)).toMatchObject({ session_minutes: 30 });
  });
});

describe("the week must still fit (R44)", () => {
  const count = (target: number) => [{ kind: "count", target }];
  const hours = (target: number) => [{ kind: "hours", target }];

  it("create: count rules at the limit are saved, one above is refused with the number", async () => {
    await app.signedInAs("alice@example.com");
    expect((await create({ ...HALF_MARATHON, rules: count(10), avoidDays: [6, 7] })).status).toBe(201);
    const before = await app.snapshot();
    expect(await read(await create({ ...HALF_MARATHON, rules: count(11), avoidDays: [6, 7] }))).toEqual({
      status: 400,
      body: { error: "week_count_fit", message: "With these days ruled out, at most 10 events a week fit" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("create: hours rules at the limit are saved, half an hour above is refused with the number", async () => {
    await app.signedInAs("alice@example.com");
    expect((await create({ ...HALF_MARATHON, rules: hours(48), avoidDays: [5, 6, 7] })).status).toBe(201);
    const before = await app.snapshot();
    expect(await read(await create({ ...HALF_MARATHON, rules: hours(48.5), avoidDays: [5, 6, 7] }))).toEqual({
      status: 400,
      body: { error: "week_hours_fit", message: "With these days ruled out, at most 48 hours a week fit" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("edit of the rules alone: checked against the saved days", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedWithRoutine(alice, "avoid_days = '1234'"); // 3 days left: 6 events, 36 hours
    const before = await app.snapshot();
    expect(await read(await edit(g.id, { ...HALF_MARATHON, rules: count(7), updatedAt: g.updatedAt }))).toEqual({
      status: 400,
      body: { error: "week_count_fit", message: "With these days ruled out, at most 6 events a week fit" },
    });
    expect(await read(await edit(g.id, { ...HALF_MARATHON, rules: hours(36.5), updatedAt: g.updatedAt }))).toEqual({
      status: 400,
      body: { error: "week_hours_fit", message: "With these days ruled out, at most 36 hours a week fit" },
    });
    expect(await app.snapshot()).toEqual(before);
    expect((await edit(g.id, { ...HALF_MARATHON, rules: count(6), updatedAt: g.updatedAt })).status).toBe(200);
    expect((await edit(g.id, { ...HALF_MARATHON, rules: hours(36), updatedAt: await updatedAtOf(g.id) })).status).toBe(200);
  });

  it("edit of the days alone: the goal's rules must fit the new days", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 8 }] });
    const [rule] = await app.db.admin<{ id: string }>("select id from app.rules where goal_id = $1", [g.id]);
    const sameRules = [{ id: rule.id, kind: "count", target: 8 }];
    const before = await app.snapshot();
    expect(await read(await edit(g.id, { ...HALF_MARATHON, rules: sameRules, avoidDays: [1, 2, 3, 4], updatedAt: g.updatedAt }))).toEqual({
      status: 400,
      body: { error: "week_count_fit", message: "With these days ruled out, at most 6 events a week fit" },
    });
    expect(await app.snapshot()).toEqual(before);
    expect((await edit(g.id, { ...HALF_MARATHON, rules: sameRules, avoidDays: [1, 2, 3], updatedAt: g.updatedAt })).status).toBe(200);
    expect(await routineRow(g.id)).toMatchObject({ avoid_days: "123" });
  });
});

describe("the sure days (mustDays)", () => {
  const BODY = { title: "Gym", deadline: null, rules: [{ kind: "count", target: 3, minMinutes: null }], avoidDays: [4, 5] };
  const mustRow = async (id: string) => (await app.db.admin<{ must_days: string }>("select must_days from app.goals where id = $1", [id]))[0].must_days;

  it("create saves them sorted and answers with them", async () => {
    await app.signedInAs("alice@example.com");
    const answer = await read(await create({ ...BODY, mustDays: [3, 1] }));
    expect(answer.status).toBe(201);
    const goal = answer.body.goal as { id: string; routine: { mustDays: number[] } };
    expect(goal.routine.mustDays).toEqual([1, 3]);
    expect(await mustRow(goal.id)).toBe("13");
  });

  it("create refuses more sure days than sessions, and a day that is ruled out; nothing is saved", async () => {
    await app.signedInAs("alice@example.com");
    expect(await read(await create({ ...BODY, mustDays: [1, 2, 3, 6] }))).toEqual({
      status: 400,
      body: { error: "must_days_count", message: "You can choose at most 3 sure days, one for each session a week" },
    });
    expect(await read(await create({ ...BODY, mustDays: [1, 4] }))).toEqual({
      status: 400,
      body: { error: "must_avoid_day", message: "A day cannot be both a sure day and a day off" },
    });
    expect(await app.db.admin("select id from app.goals")).toHaveLength(0);
  });

  it("an edit that leaves them out keeps them, minus a day now ruled out and beyond the new times a week", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedWithRoutine(alice, "must_days = '12', avoid_days = ''");
    const res = await edit(g.id, { title: "Gym", deadline: "2027-03-14", updatedAt: g.updatedAt, rules: [{ kind: "count", target: 2 }], avoidDays: [2] });
    expect(res.status).toBe(200);
    expect(await mustRow(g.id)).toBe("1");
  });
});

describe("the own time window (Custom)", () => {
  const BODY = { title: "Gym", deadline: null, rules: [{ kind: "count", target: 3, minMinutes: null }], sessionMinutes: 60 };
  const windowRow = async (id: string) =>
    (await app.db.admin<{ day_from_min: number | null; day_until_min: number | null; day_part: string | null }>("select day_from_min, day_until_min, day_part from app.goals where id = $1", [id]))[0];

  it("create saves it and answers with it; one shorter than a session is refused", async () => {
    await app.signedInAs("alice@example.com");
    const answer = await read(await create({ ...BODY, dayFrom: 390, dayUntil: 480 }));
    expect(answer.status).toBe(201);
    const goal = answer.body.goal as { id: string; routine: { dayFrom: number; dayUntil: number } };
    expect(goal.routine).toMatchObject({ dayFrom: 390, dayUntil: 480 });
    expect(await windowRow(goal.id)).toEqual({ day_from_min: 390, day_until_min: 480, day_part: null });
    expect((await read(await create({ ...BODY, dayFrom: 390, dayUntil: 420 }))).body.error).toBe("day_window_short");
  });

  it("an edit keeps it; sending a part of the day instead clears it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedWithRoutine(alice, "day_from_min = 390, day_until_min = 480, session_minutes = 60");
    const kept = await read(await edit(g.id, { title: "Gym", deadline: "2027-03-14", updatedAt: g.updatedAt, rules: [{ kind: "count", target: 2 }] }));
    expect(kept.status).toBe(200);
    expect(await windowRow(g.id)).toMatchObject({ day_from_min: 390, day_until_min: 480 });
    const updatedAt = (kept.body.goal as { updatedAt: string }).updatedAt;
    expect((await read(await edit(g.id, { title: "Gym", deadline: "2027-03-14", updatedAt, rules: [{ kind: "count", target: 2 }], dayPart: "evening" }))).status).toBe(200);
    expect(await windowRow(g.id)).toEqual({ day_from_min: null, day_until_min: null, day_part: "evening" });
  });
});
