// A profile's LinkedIn link (spec 31). Only one form is ever stored and shown:
// https://www.linkedin.com/in/<slug>, the slug 3 to 100 characters of A-Z, a-z, 0-9, "-", "_" and "%"
// (percent-encoded letters). The database checks the very same pattern (app.linkedin_url_valid), so no
// other scheme (javascript:, data:) or host can be stored. The same function runs in the browser (the
// form) and on the server (the action), and once more before a link is rendered.

/** The one stored form. The same pattern as app.linkedin_url_valid. */
export const LINKEDIN_URL = /^https:\/\/www\.linkedin\.com\/in\/[A-Za-z0-9_%-]{3,100}$/;

/**
 * What people paste: with or without "http://" or "https://", with "www.", a two-letter country host
 * ("de.") or neither, the profile path, an optional trailing slash, and an optional query or fragment
 * from LinkedIn's share button (dropped). Scheme and host in any case. Nothing else: no user info, no
 * port, no other host or path.
 */
const TYPED = /^(?:https?:\/\/)?(?:(?:www|[a-z]{2})\.)?linkedin\.com\/in\/([A-Za-z0-9_%-]{3,100})\/?(?:[?#]\S*)?$/i;

/** Whether this exact text is a link that may be stored and shown. */
export function isLinkedInUrl(value: unknown): value is string {
  return typeof value === "string" && LINKEDIN_URL.test(value);
}

export type LinkedInInput = { ok: true; url: string | null } | { ok: false };

/** The link as it is saved: the stored form, null for empty input, or a refusal. */
export function cleanLinkedIn(raw: string): LinkedInInput {
  const typed = raw.trim();
  if (typed === "") return { ok: true, url: null };
  const match = TYPED.exec(typed);
  if (!match) return { ok: false };
  const url = `https://www.linkedin.com/in/${match[1]}`;
  return isLinkedInUrl(url) ? { ok: true, url } : { ok: false };
}
