import { loadDemo } from "@/lib/server/actions/load-demo";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/load-demo.ts.
export async function POST(request: Request): Promise<Response> {
  return loadDemo(request, await realDeps());
}
