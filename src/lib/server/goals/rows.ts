import "server-only";

// Reading goal rows: the query every goal read uses, and how rows become what the page gets.
import { DEFAULT_GOAL_ICON, isGoalColor, isGoalIcon } from "@/lib/goals/style";
import type { GoalDto } from "@/lib/goals/types";
import type { Query } from "@/lib/server/db";

type GoalRow = {
  id: string;
  title: string;
  deadline: string;
  auto_block: boolean;
  color: string | null;
  icon: string;
  why: string;
  created_at: Date;
  updated_at: Date;
  rules: { id: string; kind: "count" | "hours"; target: number; min_minutes: number | null }[];
};

/**
 * The user's goals with their rules, oldest first (row-level security limits them to the user),
 * each with the time it was created (for the progress strip; not sent to the page).
 */
export async function readGoals(query: Query, onlyId?: string): Promise<{ goal: GoalDto; createdAt: Date }[]> {
  const rows = await query<GoalRow>(
    `select g.id, g.title, g.deadline::text as deadline, g.auto_block, g.color, g.icon, g.why, g.created_at, g.updated_at,
            coalesce(json_agg(json_build_object('id', r.id, 'kind', r.kind, 'target', r.target::float, 'min_minutes', r.min_minutes)
                              order by r.kind, r.target, r.id) filter (where r.id is not null), '[]') as rules
       from app.goals g left join app.rules r on r.goal_id = g.id
      where $1::uuid is null or g.id = $1::uuid
      group by g.id
      order by g.created_at, g.id`,
    [onlyId ?? null],
  );
  return rows.map((row) => ({
    createdAt: new Date(row.created_at),
    goal: {
      id: row.id,
      title: row.title,
      deadline: row.deadline,
      autoBlock: row.auto_block,
      // The database allows only the ten names; anything else would be shown with the defaults.
      color: isGoalColor(row.color) ? row.color : null,
      icon: isGoalIcon(row.icon) ? row.icon : DEFAULT_GOAL_ICON,
      why: row.why,
      updatedAt: new Date(row.updated_at).toISOString(),
      // The driver may hand JSON over as text.
      rules: (typeof row.rules === "string" ? JSON.parse(row.rules) : row.rules).map((r: GoalRow["rules"][number]) => ({
        id: r.id,
        kind: r.kind,
        target: Number(r.target),
        minMinutes: r.min_minutes,
      })),
    },
  }));
}
