import { appUrl } from "@/lib/server/config";
import { MESSAGES } from "@/lib/messages";
import { realDeps } from "@/lib/server/deps";
import { EXTENSION_ZIP_NAME, extensionZip } from "@/lib/server/extension/package";

// The Chrome extension as a ZIP, set to follow this app (spec 18). Reads nothing from the request and
// nothing from the database. Signed-in users only, like every page (R3).
export async function GET(): Promise<Response> {
  const deps = await realDeps();
  if (!(await deps.auth.currentUserId())) {
    return Response.json({ ok: false, message: MESSAGES.signInRequired }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const zip = await extensionZip(appUrl());
  return new Response(new Blob([zip as BlobPart], { type: "application/zip" }), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${EXTENSION_ZIP_NAME}"`,
      "Content-Length": String(zip.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
