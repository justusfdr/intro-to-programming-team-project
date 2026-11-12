import "server-only";

// Reading the signed-in user's demo state (spec 13): whether demo rows are left, and whether the
// welcome is due (a new account: not answered yet, and no goals, events or tasks).
import type { Query } from "@/lib/server/db";

/** True when the account still has a row from the demo (row-level security: only the user's own rows). */
export async function hasDemoRows(query: Query): Promise<boolean> {
  const [row] = await query<{ loaded: boolean }>(
    `select exists (select 1 from app.goals where demo)
         or exists (select 1 from app.events where demo)
         or exists (select 1 from app.tasks where demo) as loaded`,
  );
  return row.loaded;
}

/** True when the welcome should show: never answered, and the account has no goals, events or tasks. */
export async function welcomeDue(query: Query): Promise<boolean> {
  const [row] = await query<{ due: boolean }>(
    `select coalesce((select not welcome_answered from app.settings), false)
        and not exists (select 1 from app.goals)
        and not exists (select 1 from app.events)
        and not exists (select 1 from app.tasks) as due`,
  );
  return row.due;
}
