import "server-only";

// Action save_profile (ontology section 5; spec 40, R42) and the sidebar's own card.
// POST save_profile:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body (at most 16 kB)
//   4. clean the three fields with the same functions as the form; the first wrong one is refused with
//      its message and the field's code
//   5. inside withUser: app.set_profile, which checks every field again and writes only the user's own
//      row (the user has no write right on app.profiles, R6). A refusal changes nothing (R1).
// GET own card: the signed-in user's shown name and photo, for the row at the bottom of the sidebar.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { cleanProfile } from "@/lib/profiles/profile-fields";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { readOwnProfile } from "@/lib/server/profiles/own-profile";
import { refusalOf } from "@/lib/server/profiles/refusals";
import { requireUser } from "@/lib/server/session";

type ActionDeps = Pick<Deps, "auth" | "withUser">;

const Body = z.object({
  displayName: z.string().max(1000),
  bio: z.string().max(2000),
  linkedin: z.string().max(2000),
});

/** The code of each field's refusal (the form shows the message at that field). */
const CODES = { displayName: "invalid_name", bio: "invalid_bio", linkedin: "invalid_linkedin" } as const;

export function saveProfile(request: Request, deps: ActionDeps): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, Body);
    if (!body.ok) return body.response;

    return deps.withUser(userId, async (query) => {
      // The saved name decides whether an empty name field is allowed (only while none was ever set).
      const [own] = await query<{ display_name: string | null }>("select display_name from app.profiles");
      const clean = cleanProfile(body.data, own?.display_name ?? null);
      if (!clean.ok) throw new ActionError(400, CODES[clean.field], clean.message);
      try {
        await query("select app.set_profile($1::text, $2::text, $3::text)", [clean.displayName, clean.bio, clean.linkedinUrl]);
      } catch (error) {
        refusalOf(error);
      }
      return jsonOk({
        message: MESSAGES.profileSaved,
        profile: { displayName: clean.displayName ?? own?.display_name ?? null, bio: clean.bio, linkedinUrl: clean.linkedinUrl },
      });
    });
  });
}

/** GET: the signed-in user's shown name and photo, for the sidebar. Nothing else of the profile. */
export function ownSidebarCard(deps: ActionDeps): Promise<Response> {
  return handleAction(async () => {
    const userId = await requireUser(deps.auth);
    const profile = await deps.withUser(userId, readOwnProfile);
    return jsonOk({ name: profile.name, photoUrl: profile.photoUrl });
  });
}
