import "server-only";

// Reading goal rows: the query every goal read uses, and how rows become what the page gets.
import { avoidDaysFromText, hasRoutine, isDayPart, isGoalCategory, type GoalRoutine } from "@/lib/goals/routine";
import { DEFAULT_GOAL_ICON, isGoalColor, isGoalIcon } from "@/lib/goals/style";
import type { GoalDto } from "@/lib/goals/types";
import type { Query } from "@/lib/server/db";

export type GoalRow = {
  id: string;
  title: string;
  deadline: string;
  auto_block: boolean;
  color: string | null;
  icon: string;
  why: string;
  category: string | null;
  category_other: string | null;
  session_minutes: number | null;
  day_part: string | null;
  avoid_days: string;
  location: string | null;
  open_ended: boolean;
  created_at: Date;
  updated_at: Date;
  rules: { id: string; kind: "count" | "hours"; target: number; min_minutes: number | null }[];
};

/**
 * The user's goals with their rules, oldest first (row-level security limits them to the user),
 * each with the time it was created (for the progress strip; not sent to the page).
 */
export async function readGoals(query: Query, onlyId?: string): Promise<{ goal: GoalDto; createdAt: Date }[]> {
  // Without an id the statement has no parameter: the driver can then send it together with other
  // reads (a statement with parameters costs it one more round trip, see db/with-user.ts).
  const rows = await query<GoalRow>(
    `select g.id, g.title, g.deadline::text as deadline, g.auto_block, g.color, g.icon, g.why, g.created_at, g.updated_at,
            g.category, g.category_other, g.session_minutes, g.day_part, g.avoid_days, g.location, g.open_ended,
            coalesce(json_agg(json_build_object('id', r.id, 'kind', r.kind, 'target', r.target::float, 'min_minutes', r.min_minutes)
                              order by r.kind, r.target, r.id) filter (where r.id is not null), '[]') as rules
       from app.goals g left join app.rules r on r.goal_id = g.id
      ${onlyId === undefined ? "" : "where g.id = $1::uuid"}
      group by g.id
      order by g.created_at, g.id`,
    onlyId === undefined ? [] : [onlyId],
  );
  return rows.map((row) => {
    const routine = routineOf(row);
    return {
      createdAt: new Date(row.created_at),
      goal: {
        id: row.id,
        title: row.title,
        // An open-ended goal keeps a placeholder in the column for older versions; here it has none.
        deadline: row.open_ended ? null : row.deadline,
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
        ...(hasRoutine(routine) ? { routine } : {}),
      },
    };
  });
}

/** The routine columns of a goal row (spec 41); the database allows only valid values. */
export function routineOf(row: Pick<GoalRow, "category" | "category_other" | "session_minutes" | "day_part" | "avoid_days" | "location">): GoalRoutine {
  const category = isGoalCategory(row.category) ? row.category : null;
  return {
    category,
    categoryOther: category === "other" ? row.category_other : null,
    sessionMinutes: row.session_minutes,
    dayPart: isDayPart(row.day_part) ? row.day_part : null,
    avoidDays: avoidDaysFromText(row.avoid_days),
    location: row.location,
  };
}

/**
 * Whether a goal has no end date, and its saved routine (spec 41), for edit_goal: the fields an edit
 * leaves out keep these values. Call it after findOwnGoal, which locks the row and answers "Not found"
 * for anything that is not the user's goal.
 */
export async function readSavedRoutine(query: Query, goalId: string): Promise<{ openEnded: boolean; routine: GoalRoutine }> {
  const [row] = await query<Pick<GoalRow, "open_ended" | "category" | "category_other" | "session_minutes" | "day_part" | "avoid_days" | "location">>(
    `select open_ended, category, category_other, session_minutes, day_part, avoid_days, location
       from app.goals where id = $1::uuid`,
    [goalId],
  );
  return { openEnded: row.open_ended, routine: routineOf(row) };
}
