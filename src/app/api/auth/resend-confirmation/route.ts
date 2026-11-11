import { resendConfirmation } from "@/lib/server/actions/resend-confirmation";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/resend-confirmation.ts.
export async function POST(request: Request): Promise<Response> {
  return resendConfirmation(request, await realDeps());
}
