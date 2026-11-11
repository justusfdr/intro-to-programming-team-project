import { resetPassword } from "@/lib/server/actions/reset-password";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/reset-password.ts.
export async function POST(request: Request): Promise<Response> {
  return resetPassword(request, await realDeps());
}
