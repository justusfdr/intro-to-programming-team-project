import "server-only";

// R33: a done task is deleted by itself 7 days after it was done (ontology: remove_done_tasks).
// It runs whenever tasks are read and before every task action, in a transaction of its own that is
// saved at once (the way settleSessions finishes sessions), so
// - the removal stays saved even when the user's action is then rejected, and
// - a rejected action still changes nothing of its own (R1).
// The database's clock decides, the same clock that wrote done_at.
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";

export async function removeDoneTasks(query: Query): Promise<void> {
  await query("delete from app.tasks where status = 'done' and done_at <= now() - interval '7 days'");
}

export async function settleTasks(deps: Pick<Deps, "withUser">, userId: string): Promise<void> {
  await deps.withUser(userId, removeDoneTasks);
}
