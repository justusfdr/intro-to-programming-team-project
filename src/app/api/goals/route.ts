import { createGoal } from "@/lib/server/actions/create-goal";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/create-goal.ts.
export async function POST(request: Request): Promise<Response> {
  return createGoal(request, await realDeps());
}
