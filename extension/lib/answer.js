// Pure logic of the extension: checking the app's answer, deciding what to keep, and which sites
// to block now. No browser APIs here, so the repository's tests can run it.

const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const MAX_SITES = 50;

/**
 * The app's answer as the extension keeps it: { sites, blockingOn, blockingUntil (ms or null) },
 * or null when the answer is not exactly what the app sends (then nothing is blocked).
 */
export function readAnswer(body) {
  if (typeof body !== "object" || body === null) return null;
  const { sites, blockingOn, blockingUntil } = body;
  if (!Array.isArray(sites) || sites.length > MAX_SITES) return null;
  if (!sites.every((site) => typeof site === "string" && site.length <= 253 && DOMAIN.test(site))) return null;
  if (typeof blockingOn !== "boolean") return null;
  let until = null;
  if (blockingUntil !== null) {
    until = typeof blockingUntil === "string" ? Date.parse(blockingUntil) : NaN;
    if (!Number.isFinite(until)) return null;
  }
  if (blockingOn && until === null) return null;
  return { sites: [...new Set(sites)], blockingOn, blockingUntil: until };
}

/**
 * What to keep after asking the app (R16). `result` is one of
 *   { kind: "answer", body }  the app answered 200;
 *   { kind: "refused" }       401, 403 or anything else that says no;
 *   { kind: "unreachable" }   no answer (network, timeout, server error).
 * Fail closed: anything but a valid answer or a short outage means nothing is kept.
 */
export function nextKept(kept, result, now) {
  if (result.kind === "answer") return readAnswer(result.body);
  if (result.kind === "unreachable" && kept && kept.blockingOn && kept.blockingUntil > now) return kept;
  return null;
}

/** The sites to block right now: only while blocking is on and blocking_until has not passed. */
export function sitesToBlock(kept, now) {
  if (!kept || !kept.blockingOn || kept.blockingUntil === null || kept.blockingUntil <= now) return [];
  return kept.sites;
}

/** True when `host` is a blocked site or a subdomain of one ("m.youtube.com" for "youtube.com"). */
export function isBlockedHost(host, sites) {
  const h = String(host).toLowerCase().replace(/\.$/, "");
  return sites.some((site) => h === site || h.endsWith(`.${site}`));
}

/**
 * One redirect rule per site: page loads (main frame only) of the site and its subdomains go to the
 * block page. `nonce` marks the redirects the extension made itself, so only those count as attempts.
 */
export function buildRules(sites, nonce) {
  return sites.map((site, index) => ({
    id: index + 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { extensionPath: `/blocked.html?site=${encodeURIComponent(site)}&via=load&n=${encodeURIComponent(nonce)}` },
    },
    condition: { requestDomains: [site], resourceTypes: ["main_frame"] },
  }));
}

/** The least time between two extra polls started by a tab that opens a listed site. */
export const TAB_POLL_GAP_MS = 5000;

/**
 * Whether a tab that starts loading `url` should trigger one extra poll: blocking is off now (nothing
 * to block), the host is on the kept block list (a focus session may have just started), and the last
 * extra poll was at least TAB_POLL_GAP_MS ago. `lastPollAt` is null before the first.
 */
export function shouldPollForTab(kept, url, now, lastPollAt) {
  if (!kept || sitesToBlock(kept, now).length > 0) return false;
  if (lastPollAt !== null && now - lastPollAt < TAB_POLL_GAP_MS) return false;
  let host = "";
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol === "http:" || parsed.protocol === "https:") host = parsed.hostname;
  } catch {
    return false;
  }
  return host !== "" && isBlockedHost(host, kept.sites);
}
