// Helpers for goal tests: put goals with their rules straight into the database (bypassing the
// actions) and read them back. A goal must have a rule when the transaction ends, so a goal and
// its rules go in with one statement.
import type { TestDb } from "../db/harness";

export type SeedRule = { kind: "count" | "hours"; target: number; minMinutes?: number | null };

export type SeedGoal = {
  title?: string;
  deadline: string; // "2027-03-14"
  autoBlock?: boolean;
  /** When the goal was created, e.g. "2026-11-09T10:00:00Z" for "last week". Default: now. */
  createdAt?: string;
  rules: SeedRule[];
};

/** Inserts a goal and its rules for `userId` as the database owner. Returns the ids (rule ids in no fixed order) and updated_at. */
export async function seedGoal(
  db: TestDb,
  userId: string,
  goal: SeedGoal,
): Promise<{ id: string; updatedAt: string; ruleIds: string[] }> {
  const rows = await db.admin<{ goal_id: string; rule_id: string; updated_at: Date }>(
    `with g as (
       insert into app.goals (user_id, title, deadline, auto_block, created_at)
       values ($1, $2, $3, $4, coalesce($5::timestamptz, now()))
       returning id, user_id, updated_at
     ), r as (
       insert into app.rules (user_id, goal_id, kind, target, min_minutes)
       select g.user_id, g.id, x.value ->> 'kind', (x.value ->> 'target')::numeric, (x.value ->> 'min_minutes')::int
         from g, jsonb_array_elements($6::jsonb) with ordinality as x(value, n)
        order by x.n
       returning id, goal_id
     )
     select r.goal_id, r.id as rule_id, g.updated_at from r join g on g.id = r.goal_id`,
    [
      userId,
      goal.title ?? "Run a half marathon",
      goal.deadline,
      goal.autoBlock ?? false,
      goal.createdAt ?? null,
      JSON.stringify(goal.rules.map((r) => ({ kind: r.kind, target: r.target, min_minutes: r.minMinutes ?? null }))),
    ],
  );
  return { id: rows[0].goal_id, updatedAt: new Date(rows[0].updated_at).toISOString(), ruleIds: rows.map((r) => r.rule_id) };
}

/** A user's goals with their rules, as the database holds them, oldest first. */
export async function goalsOf(db: TestDb, userId: string) {
  return db.admin(
    `select g.id, g.title, g.deadline::text as deadline, g.auto_block,
            coalesce(json_agg(json_build_object('kind', r.kind, 'target', r.target::float, 'min_minutes', r.min_minutes)
                              order by r.kind, r.target) filter (where r.id is not null), '[]') as rules
       from app.goals g left join app.rules r on r.goal_id = g.id
      where g.user_id = $1
      group by g.id order by g.created_at, g.id`,
    [userId],
  );
}

/** A valid create_goal body: spec 03's "Run a half marathon", 2 runs of at least 45 minutes a week. */
export const HALF_MARATHON = {
  title: "Run a half marathon",
  deadline: "2027-03-14",
  autoBlock: false,
  rules: [{ kind: "count" as const, target: 2, minMinutes: 45 }],
};
