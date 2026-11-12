import { removeDemo } from "@/lib/server/actions/remove-demo";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/remove-demo.ts.
export async function POST(request: Request): Promise<Response> {
  return removeDemo(request, await realDeps());
}
