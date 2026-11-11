import { signUp } from "@/lib/server/actions/sign-up";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/sign-up.ts.
export async function POST(request: Request): Promise<Response> {
  return signUp(request, await realDeps());
}
