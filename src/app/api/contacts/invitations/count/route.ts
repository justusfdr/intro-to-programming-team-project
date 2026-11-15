import { invitationCount } from "@/lib/server/actions/contacts";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the count itself (and its tests) live in src/lib/server/actions/contacts.ts.
export async function GET(): Promise<Response> {
  return invitationCount(await realDeps());
}
