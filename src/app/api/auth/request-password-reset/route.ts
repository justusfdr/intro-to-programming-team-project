import { requestPasswordReset } from "@/lib/server/actions/request-password-reset";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/request-password-reset.ts.
export async function POST(request: Request): Promise<Response> {
  return requestPasswordReset(request, await realDeps());
}
