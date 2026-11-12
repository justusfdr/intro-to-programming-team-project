import "server-only";

// Which requests count as coming from our Chrome extension (blocker design, approved).
// A request from the extension's service worker carries Origin "chrome-extension://<our id>" (it is
// a POST) and Sec-Fetch-Site "none"; a web page can set neither header, and gets no answer it can
// read, because we never send CORS headers. The session cookie is checked separately (requireUser).
import { extensionId } from "@/lib/server/config";
import { checkHost, jsonError } from "@/lib/server/http";
import { MESSAGES } from "@/lib/messages";

/** Returns an error answer (403, no data) unless the request comes from our extension; null when it does. */
export function assertFromExtension(request: Request): Response | null {
  const hostDenied = checkHost(request);
  if (hostDenied) return hostDenied;
  const fromOurExtension =
    request.headers.get("origin") === `chrome-extension://${extensionId()}` && request.headers.get("sec-fetch-site") === "none";
  return fromOurExtension ? null : jsonError(403, "forbidden", MESSAGES.forbidden);
}
