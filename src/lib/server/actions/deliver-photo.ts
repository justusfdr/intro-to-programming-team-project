import "server-only";

// GET /api/profiles/[id]/photo (spec 28, R43): a user's photo, for the signed-in user only when they
// may see it (themselves, a contact, or someone with an open invitation from that user). The database
// function app.profile_photo checks the relation. "No such user", "not your contact", "no photo" and
// an id that is not a uuid all get the very same 404, in body and headers.
//
// The photo is served as an image that can never run as a page: its stored type (decided from its
// bytes), nosniff, a content security policy that allows nothing and sandboxes it, and only our own
// pages may embed it (Cross-Origin-Resource-Policy).
//
// The browser may keep a copy but must ask again before each use ("private, no-cache"), so a photo is
// gone from the screen as soon as access ends. The question is cheap: the answer carries an ETag made
// from the photo's time, and a request that sends it back (If-None-Match) gets an empty 304 when the
// photo is unchanged. The 304 comes only after the same permission check as the photo itself; without
// permission the answer is the same 404 as always.
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { photoTypeOf } from "@/lib/profiles/photo";
import { requireUser } from "@/lib/server/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Headers of every answer of this route, success and 404 alike. */
const COMMON = {
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; sandbox",
} as const;

/** The one 404 of this route. */
export function photoNotFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { ...COMMON, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Whether an If-None-Match header names this ETag (a list of tags, weak ones, or "*"). */
function matchesETag(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(",").some((tag) => {
    const trimmed = tag.trim();
    return trimmed === "*" || trimmed.replace(/^W\//, "") === etag;
  });
}

export function deliverProfilePhoto(
  deps: Pick<Deps, "auth" | "withUser">,
  id: string,
  ifNoneMatch: string | null = null,
): Promise<Response> {
  return handleAction(async () => {
    const userId = await requireUser(deps.auth);
    if (!UUID.test(id)) return photoNotFound();

    // version: the photo's time in microseconds, so two uploads in the same millisecond still differ.
    const [row] = await deps.withUser(userId, (query) =>
      query<{ mime: string; data: string; version: string }>(
        "select mime, data, (extract(epoch from updated_at) * 1000000)::bigint::text as version from app.profile_photo($1::uuid)",
        [id],
      ),
    );
    if (!row) return photoNotFound();

    const etag = `"${row.version}"`;
    const caching = { "Cache-Control": "private, no-cache", ETag: etag };
    if (matchesETag(ifNoneMatch, etag)) {
      return new Response(null, { status: 304, headers: { ...COMMON, ...caching } });
    }

    const bytes = Buffer.from(row.data, "base64");
    // The stored type is the bytes' own (the database checks it); checked once more before serving.
    if (photoTypeOf(bytes) !== row.mime) return photoNotFound();

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...COMMON,
        "Content-Type": row.mime,
        "Content-Length": String(bytes.length),
        "Content-Disposition": "inline",
        ...caching,
      },
    });
  });
}
