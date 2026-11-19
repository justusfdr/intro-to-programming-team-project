import "server-only";

// GET /api/profiles/[id]/photo (spec 40, spec 53, R43): a user's photo, for the user themselves, their
// contacts and the people they have an open invitation from. The database decides: app.profile_photo
// checks its own rule, and the photo is served only when app.profile_card gives a row for the same id too.
// The second check keeps the photo to R43 exactly: the live database's app.may_see_profile (behind
// app.profile_photo) also lets people of the old shared lists and event invitations see each other, rows
// this version of the app neither writes nor uses (docs/setup.md), while app.profile_card follows R43.
// "No such user", "someone the user may not see", "no photo" and an id that is not a uuid all get the
// very same 404, in body and headers.
//
// The photo is served as an image that can never run as a page: its stored type (decided from its
// bytes), nosniff, a content security policy that allows nothing and sandboxes it, and only our own
// pages may embed it (Cross-Origin-Resource-Policy).
//
// The browser may keep a copy but must ask again before each use ("private, no-cache"), so a removed
// photo is gone from the screen at once. The question is cheap: the answer carries an ETag made from the
// photo's time, and a request that sends it back (If-None-Match) gets an empty 304 when the photo is
// unchanged. The 304 comes only after the same checks as the photo itself; otherwise the answer is the
// same 404 as always.
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
    // Only when app.profile_card also gives a row: the photo follows the card's rule (R43), see above.
    const [row] = await deps.withUser(userId, (query) =>
      query<{ mime: string; data: string; version: string }>(
        `select p.mime, p.data, (extract(epoch from p.updated_at) * 1000000)::bigint::text as version
           from app.profile_photo($1::uuid) p
          where exists (select 1 from app.profile_card($1::uuid))`,
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
