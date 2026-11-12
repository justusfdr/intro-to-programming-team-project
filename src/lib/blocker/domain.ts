// R17: domains are cleaned before saving ("https://www.Instagram.com/reels" becomes "instagram.com").
// Pure function; the database checks the same form again (app.is_clean_domain).

const LABEL = "[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?";
const CLEAN = new RegExp(`^(${LABEL}\\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$`);

/** The cleaned domain, or null when the input is not a website ("not a site", "localhost", an IP address). */
export function cleanDomain(input: string): string | null {
  const text = input.trim();
  if (text === "" || /\s/.test(text)) return null;
  let host: string;
  try {
    // Without a scheme, read it as a web address; the URL parser lower-cases and converts IDNs to xn--.
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "").replace(/^www\./, "");
  if (host.length > 253 || !CLEAN.test(host)) return null;
  return host;
}
