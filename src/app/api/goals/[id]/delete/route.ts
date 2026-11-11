import { deleteGoal } from "@/lib/server/actions/delete-goal";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/delete-goal.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return deleteGoal(request, await realDeps(), id);
}
