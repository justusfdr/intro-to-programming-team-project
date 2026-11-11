import { removeRule } from "@/lib/server/actions/remove-rule";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/remove-rule.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return removeRule(request, await realDeps(), id);
}
