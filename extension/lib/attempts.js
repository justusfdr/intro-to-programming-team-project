// Pure logic for blocked attempts waiting to be sent (R16: sent later when the app is unreachable).

const KEEP_MS = 48 * 60 * 60 * 1000; // the app accepts attempts up to 48 hours old
const MAX_WAITING = 200;
const SAME_PAGE_MS = 5000; // a page that reloads itself is counted once
export const BATCH = 50; // the app takes at most 50 per request

/** The queue with a new attempt, unless the same site was stopped in the last 5 seconds. */
export function addAttempt(queue, domain, now) {
  const fresh = dropOld(queue, now);
  const last = fresh[fresh.length - 1];
  if (last && last.domain === domain && now - Date.parse(last.attemptedAt) < SAME_PAGE_MS) return fresh;
  return [...fresh, { domain, attemptedAt: new Date(now).toISOString() }].slice(-MAX_WAITING);
}

/** Attempts the app would no longer accept are dropped. */
export function dropOld(queue, now) {
  return (Array.isArray(queue) ? queue : []).filter((a) => now - Date.parse(a.attemptedAt) <= KEEP_MS);
}

/**
 * Whether a message from the block page is a real attempt: it carries the nonce of the extension's
 * own redirect rules ("load"). Already-open tabs the extension moved ("open"), and block page
 * addresses made up by anyone else (no or a wrong nonce), are not attempts.
 */
export function isRealAttempt(message, currentNonce, sites) {
  return (
    typeof message === "object" &&
    message !== null &&
    message.via === "load" &&
    typeof message.n === "string" &&
    typeof currentNonce === "string" &&
    currentNonce.length > 0 &&
    message.n === currentNonce &&
    typeof message.site === "string" &&
    sites.includes(message.site)
  );
}
