import { setDisplayName } from "@/lib/server/actions/set-display-name";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/set-display-name.ts.
export async function POST(request: Request): Promise<Response> {
  return setDisplayName(request, await realDeps());
}
