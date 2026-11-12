import { extensionState } from "@/lib/server/actions/extension-state";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/extension-state.ts.
export async function POST(request: Request): Promise<Response> {
  return extensionState(request, await realDeps());
}
