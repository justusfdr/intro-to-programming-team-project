import { ownSidebarCard, saveProfile } from "@/lib/server/actions/save-profile";
import { realDeps } from "@/lib/server/deps";

// Thin wrappers: the action and the sidebar's card (and their tests) live in
// src/lib/server/actions/save-profile.ts.
export async function GET(): Promise<Response> {
  return ownSidebarCard(await realDeps());
}

export async function POST(request: Request): Promise<Response> {
  return saveProfile(request, await realDeps());
}
