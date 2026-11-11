import "server-only";

// Finding the signed-in user's goals and rules by id, for edit_goal, remove_rule, delete_goal and the
// goal of an event. Another user's row, a deleted one and an id that is not a uuid all get the same
// answer: "Not found" (R3). Row-level security does the real work. For the two-device check (R4)
// use assertUnchangedSince from src/lib/server/events/own-event.ts with the goal's row.
import type { Query } from "@/lib/server/db";
import { notFound } from "@/lib/server/events/own-event";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GoalRow = { id: string; deadline: string; updated_at: Date };
export type RuleRow = { id: string; goal_id: string };

/** The user's goal, locked until the transaction ends (a second device waits). "Not found" otherwise. */
export async function findOwnGoal(query: Query, id: string): Promise<GoalRow> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await query<GoalRow>("select id, deadline::text as deadline, updated_at from app.goals where id = $1 for update", [id]);
  if (!row) throw notFound();
  return row;
}

/** The user's rule (with its goal), locked. "Not found" otherwise. */
export async function findOwnRule(query: Query, id: string): Promise<RuleRow> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await query<RuleRow>("select id, goal_id from app.rules where id = $1 for update", [id]);
  if (!row) throw notFound();
  return row;
}

/**
 * For an event's goal: null (no goal) passes; otherwise the goal must be the user's, else "Not found".
 * The database refuses another user's goal too (events_goal_of_same_user); this gives the clear answer.
 */
export async function assertOwnGoal(query: Query, goalId: string | null): Promise<void> {
  if (goalId === null) return;
  if (!UUID.test(goalId)) throw notFound();
  const [row] = await query("select 1 from app.goals where id = $1", [goalId]);
  if (!row) throw notFound();
}

/** Marks the goal as changed (new updated_at) after its rules changed, so R4 sees the change. */
export async function touchGoal(query: Query, goalId: string): Promise<void> {
  // The trigger sets updated_at on every update; "title = title" changes nothing else.
  await query("update app.goals set title = title where id = $1", [goalId]);
}
