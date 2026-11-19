// Tests for goals without an end date (spec 41; ontology create_goal, edit_goal, R9): a deadline of null
// makes a goal open-ended with a placeholder in the deadline column (today plus 364 days in the user's
// time zone, for older versions of the app); the answer, the page and the coach's goals say deadline
// null; a later edit leaves the placeholder alone; a date ends it; a past date is still refused.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { HALF_MARATHON, seedGoal } from "@test/support/goals";
import { buildAssistantInput } from "@/lib/chat/input";
import { chatTotals } from "@/lib/chat/totals";
import { readGoalInputs } from "@/lib/server/chat/rows";
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

async function deadlineRow(goalId: string) {
  const [row] = await app.db.admin<{ deadline: string; open_ended: boolean }>(
    "select deadline::text as deadline, open_ended from app.goals where id = $1",
    [goalId],
  );
  return row;
}

async function updatedAtOf(goalId: string): Promise<string> {
  const [{ updated_at }] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.goals where id = $1", [goalId]);
  return new Date(updated_at).toISOString();
}

describe("create_goal without an end date", () => {
  it("saves open_ended with today plus 364 days as placeholder, and answers deadline null", async () => {
    await app.signedInAs("alice@example.com"); // Europe/Lisbon: today is Monday 16 November 2026
    const answer = await read(await create({ ...HALF_MARATHON, deadline: null }));
    expect(answer.status).toBe(201);
    const goal = answer.body.goal as { id: string; deadline: unknown };
    expect(goal.deadline).toBeNull();
    expect("routine" in goal).toBe(false);
    expect(await deadlineRow(goal.id)).toEqual({ deadline: "2027-11-15", open_ended: true });
  });

  it("counts the 364 days from today in the user's time zone", async () => {
    // 09:00 UTC on 16 November is still Sunday 15 November in Pago Pago (UTC-11).
    await app.signedInAs("alice@example.com", { timeZone: "Pacific/Pago_Pago" });
    const answer = await read(await create({ ...HALF_MARATHON, deadline: null }));
    expect(await deadlineRow((answer.body.goal as { id: string }).id)).toEqual({ deadline: "2027-11-14", open_ended: true });
  });

  it("shows 'No end date' and the strip up to this week on the goals page", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await create({ ...HALF_MARATHON, deadline: null });
    const [goal] = await loadGoals(app.deps, alice);
    expect(goal.deadline).toBeNull();
    expect(goal.progress.countdown).toBe("No end date");
    expect(goal.progress.weeks).toEqual([{ monday: "2026-11-16", status: "open", isCurrent: true }]);
  });

  it("still refuses a past date and saves nothing", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await create({ ...HALF_MARATHON, deadline: "2026-11-15" }))).toEqual({
      status: 400,
      body: { error: "deadline_past", message: "The deadline cannot be in the past" },
    });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("edit_goal and the end date", () => {
  it("switches a dated goal to open-ended (placeholder written now) and back to a date", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: HALF_MARATHON.rules });

    const open = await read(await edit(g.id, { ...HALF_MARATHON, deadline: null, updatedAt: g.updatedAt }));
    expect(open.status).toBe(200);
    expect((open.body.goal as { deadline: unknown }).deadline).toBeNull();
    expect(await deadlineRow(g.id)).toEqual({ deadline: "2027-11-15", open_ended: true });

    const dated = await read(await edit(g.id, { ...HALF_MARATHON, deadline: "2027-06-30", updatedAt: await updatedAtOf(g.id) }));
    expect(dated.status).toBe(200);
    expect((dated.body.goal as { deadline: unknown }).deadline).toBe("2027-06-30");
    expect(await deadlineRow(g.id)).toEqual({ deadline: "2027-06-30", open_ended: false });
  });

  it("a later edit of an open-ended goal leaves the placeholder alone", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const answer = await read(await create({ ...HALF_MARATHON, deadline: null }));
    const id = (answer.body.goal as { id: string }).id;
    app.advance(30 * 24 * 60 * 60 * 1000); // a month later
    const later = await read(await edit(id, { ...HALF_MARATHON, title: "Run a full marathon", deadline: null, updatedAt: await updatedAtOf(id) }));
    expect(later.status).toBe(200);
    expect(await deadlineRow(id)).toEqual({ deadline: "2027-11-15", open_ended: true });
    expect((await loadGoals(app.deps, alice))[0]).toMatchObject({ title: "Run a full marathon", deadline: null });
  });

  it("switching back needs a date that is not in the past; the placeholder never counts as the kept deadline", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: HALF_MARATHON.rules });
    // An open-ended goal whose placeholder has passed (as if made long ago).
    await app.db.admin("update app.goals set open_ended = true, deadline = '2026-11-01' where id = $1", [g.id]);
    const updatedAt = await updatedAtOf(g.id);
    const before = await app.snapshot();
    expect(await read(await edit(g.id, { ...HALF_MARATHON, deadline: "2026-11-01", updatedAt }))).toEqual({
      status: 400,
      body: { error: "deadline_past", message: "The deadline cannot be in the past" },
    });
    expect(await read(await edit(g.id, { ...HALF_MARATHON, deadline: "", updatedAt }))).toEqual({
      status: 400,
      body: { error: "deadline_required", message: "Choose a deadline" },
    });
    // Anything else that is not a date stays the generic answer.
    expect(await read(await edit(g.id, { ...HALF_MARATHON, deadline: "tomorrow", updatedAt }))).toEqual({
      status: 400,
      body: { error: "bad_request", message: "Invalid request." },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("an unchanged past deadline of a dated goal still stays allowed", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const g = await seedGoal(app.db, alice, { deadline: "2026-11-01", rules: HALF_MARATHON.rules });
    expect((await edit(g.id, { ...HALF_MARATHON, deadline: "2026-11-01", updatedAt: g.updatedAt })).status).toBe(200);
  });

  it("another user's goal is 'Not found' with a deadline of null as well, and is not changed (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const theirs = await seedGoal(app.db, bob, { deadline: "2027-03-14", rules: HALF_MARATHON.rules });
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await edit(theirs.id, { ...HALF_MARATHON, deadline: null, updatedAt: theirs.updatedAt }))).toEqual({
      status: 404,
      body: { error: "not_found", message: "Not found" },
    });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("the coach's goals (R22)", () => {
  it("sends an open-ended goal with deadline null and nothing of the routine", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await create({ ...HALF_MARATHON, deadline: null, category: "sport", sessionMinutes: 60, dayPart: "morning", avoidDays: [7], location: "Park" });
    await create({ ...HALF_MARATHON, title: "Exam", deadline: "2027-01-20" });
    const goals = await app.db.withUser(alice, (q) => readGoalInputs(q));
    const now = app.now();
    const input = buildAssistantInput({
      now,
      timeZone: "Europe/Lisbon",
      dayStartHour: 7,
      dayEndHour: 22,
      history: [],
      goals,
      calendar: [],
      totals: chatTotals({ doneEvents: [], sessions: [], goals: [] }, now, "Europe/Lisbon"),
      message: "Plan my week",
    });
    expect(input.goals).toEqual([
      { id: goals[0].id, title: "Run a half marathon", deadline: null, rules: [{ kind: "count", target: 2, minMinutes: 45 }] },
      { id: goals[1].id, title: "Exam", deadline: "2027-01-20", rules: [{ kind: "count", target: 2, minMinutes: 45 }] },
    ]);
    const sent = JSON.stringify(input);
    for (const word of ["Park", "sport", "morning", "routine", "sessionMinutes", "avoidDays"]) expect(sent).not.toContain(word);
  });
});
