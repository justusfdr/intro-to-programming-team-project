import "server-only";

// Actions upload_photo and remove_photo (ontology section 5; spec 28, R42).
// upload_photo:
//   1. same-origin check   2. signed in (R3)   3. read the body, at most 300 kB: { data: base64 }
//   4. decode strictly; at most 200,000 bytes ("A photo can be at most 200 KB"); the type from the
//      first bytes only, JPEG, PNG or WebP ("A photo must be a JPEG, PNG or WebP image"); a type the
//      browser claims is never read
//   5. inside withUser: app.set_profile_photo, which decodes and checks the bytes again and stores
//      the user's own photo only. A refusal changes nothing (R1).
// The browser has already cropped the picture to a square of 256 x 256 and encoded it again, which
// also drops location data; the server does not rely on that.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { checkPhoto, isStrictBase64 } from "@/lib/profiles/photo";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { photoUrlOf } from "@/lib/server/profiles/cards";
import { refusalOf } from "@/lib/server/profiles/refusals";
import { requireUser } from "@/lib/server/session";

/** The upload's own body limit: 200,000 bytes are about 267 kB as base64, plus the JSON around it. */
export const PHOTO_BODY_BYTES = 300 * 1024;

const Body = z.object({ data: z.string() });

export function uploadProfilePhoto(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, Body, PHOTO_BODY_BYTES);
    if (!body.ok) {
      if (body.response.status === 413) throw new ActionError(413, "photo_size", MESSAGES.photoSize);
      return body.response;
    }

    if (!isStrictBase64(body.data.data)) throw new ActionError(400, "photo_type", MESSAGES.photoType);
    const bytes = Buffer.from(body.data.data, "base64");
    const check = checkPhoto(bytes);
    if (!check.ok) {
      throw check.reason === "too_large"
        ? new ActionError(413, "photo_size", MESSAGES.photoSize)
        : new ActionError(400, "photo_type", MESSAGES.photoType);
    }

    let savedAt: Date | string;
    try {
      // Binary data travels as base64 text and is decoded in the database (the same for both drivers).
      const [row] = await deps.withUser(userId, (query) =>
        query<{ at: Date | string }>("select app.set_profile_photo($1::text) as at", [bytes.toString("base64")]),
      );
      savedAt = row.at;
    } catch (error) {
      refusalOf(error);
    }
    return jsonOk({ message: MESSAGES.photoSaved, photoUrl: photoUrlOf(userId, savedAt) });
  });
}

export function removeProfilePhoto(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);
    await deps.withUser(userId, (query) => query("select app.remove_profile_photo()"));
    return jsonOk({ message: MESSAGES.photoRemoved });
  });
}
