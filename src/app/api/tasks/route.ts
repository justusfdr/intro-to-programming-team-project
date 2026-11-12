import { addTask } from "@/lib/server/actions/add-task";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/add-task.ts.
export async function POST(request: Request): Promise<Response> {
  return addTask(request, await realDeps());
}
