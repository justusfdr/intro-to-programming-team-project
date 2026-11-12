import { extensionAttempts } from "@/lib/server/actions/extension-attempts";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/extension-attempts.ts.
export async function POST(request: Request): Promise<Response> {
  return extensionAttempts(request, await realDeps());
}
