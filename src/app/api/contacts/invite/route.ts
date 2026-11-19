import { inviteContact } from "@/lib/server/actions/invite-contact";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/invite-contact.ts.
export async function POST(request: Request): Promise<Response> {
  return inviteContact(request, await realDeps());
}
