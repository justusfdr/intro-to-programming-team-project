import "server-only";

// Data for the goals column: the signed-in user's tasks, in R33's order. Done tasks older than 7 days
// are removed first, in their own transaction (R33).
import type { Deps } from "@/lib/server/deps";
import { sortTasks } from "@/lib/tasks/order";
import type { TaskDto } from "@/lib/tasks/types";
import { readTasks } from "./rows";
import { settleTasks } from "./settle";

export async function loadTasks(deps: Pick<Deps, "withUser">, userId: string): Promise<TaskDto[]> {
  await settleTasks(deps, userId);
  return sortTasks(await deps.withUser(userId, readTasks));
}
