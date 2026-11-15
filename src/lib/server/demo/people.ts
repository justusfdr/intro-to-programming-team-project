import "server-only";

// The signed-in user's choice to see the demo contacts (spec 32). The people themselves live in code
// (src/lib/demo/people.ts); the database only says whether this user wants them.
import type { Query } from "@/lib/server/db";

/** True when the user has switched the demo contacts on (row-level security: only their own row). */
export async function readDemoContactsOn(query: Query): Promise<boolean> {
  const [row] = await query<{ demo_contacts: boolean }>("select demo_contacts from app.profiles");
  return row?.demo_contacts === true;
}
