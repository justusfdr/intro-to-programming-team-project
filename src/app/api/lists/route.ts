import { createList } from "@/lib/server/actions/lists";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/lists.ts.
export async function POST(request: Request): Promise<Response> {
  return createList(request, await realDeps());
}
