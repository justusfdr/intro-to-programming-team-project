import { deleteAccount } from "@/lib/server/actions/delete-account";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/delete-account.ts.
export async function POST(request: Request): Promise<Response> {
  return deleteAccount(request, await realDeps());
}
