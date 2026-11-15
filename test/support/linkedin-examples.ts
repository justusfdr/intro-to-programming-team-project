// One table of examples for the LinkedIn link of a profile (spec 31): the stored form that the database
// check (app.linkedin_url_valid) and the TypeScript pattern (LINKEDIN_URL in src/lib/profiles/linkedin.ts)
// both accept, and what the form turns typed input into. The database tests and the TypeScript tests
// both run every row, so the two sides cannot drift apart.

export type StoredExample = { what: string; url: string; ok: boolean };

/** Is this exact text a link that may be stored and shown? */
export const STORED_EXAMPLES: readonly StoredExample[] = [
  { what: "the plain form", url: "https://www.linkedin.com/in/lea-martins", ok: true },
  { what: "digits, underscore and a percent-encoded letter", url: "https://www.linkedin.com/in/lea_m-2b%C3%A9", ok: true },
  { what: "the shortest slug (3)", url: "https://www.linkedin.com/in/abc", ok: true },
  { what: "the longest slug (100)", url: `https://www.linkedin.com/in/${"a".repeat(100)}`, ok: true },
  { what: "a slug of 2", url: "https://www.linkedin.com/in/ab", ok: false },
  { what: "a slug of 101", url: `https://www.linkedin.com/in/${"a".repeat(101)}`, ok: false },
  { what: "a trailing slash (removed on save)", url: "https://www.linkedin.com/in/lea-martins/", ok: false },
  { what: "http", url: "http://www.linkedin.com/in/lea-martins", ok: false },
  { what: "without www", url: "https://linkedin.com/in/lea-martins", ok: false },
  { what: "a country host", url: "https://de.linkedin.com/in/lea-martins", ok: false },
  { what: "another host", url: "https://www.linkedin.com.evil.example/in/lea-martins", ok: false },
  { what: "a look-alike host", url: "https://www.linkedln.com/in/lea-martins", ok: false },
  { what: "user info before the host", url: "https://www.linkedin.com@evil.example/in/lea", ok: false },
  { what: "a company page", url: "https://www.linkedin.com/company/lockedin", ok: false },
  { what: "a path below the profile", url: "https://www.linkedin.com/in/lea-martins/details", ok: false },
  { what: "a query", url: "https://www.linkedin.com/in/lea-martins?trk=x", ok: false },
  { what: "a fragment", url: "https://www.linkedin.com/in/lea-martins#about", ok: false },
  { what: "upper-case scheme and host", url: "HTTPS://WWW.LINKEDIN.COM/in/lea-martins", ok: false },
  { what: "a dot in the slug", url: "https://www.linkedin.com/in/lea.martins", ok: false },
  { what: "a non-ASCII letter in the slug", url: "https://www.linkedin.com/in/léa-martins", ok: false },
  { what: "a space in the slug", url: "https://www.linkedin.com/in/lea martins", ok: false },
  { what: "a line break at the end", url: "https://www.linkedin.com/in/lea-martins\n", ok: false },
  { what: "javascript:", url: "javascript:alert(1)//https://www.linkedin.com/in/lea", ok: false },
  { what: "data:", url: "data:text/html,https://www.linkedin.com/in/lea", ok: false },
  { what: "empty", url: "", ok: false },
];

export type TypedExample = { what: string; typed: string; saved: string | null | "refused" };

/** What the form saves for typed input: the stored form, null (cleared) or a refusal. */
export const TYPED_EXAMPLES: readonly TypedExample[] = [
  { what: "the plain form", typed: "https://www.linkedin.com/in/lea-martins", saved: "https://www.linkedin.com/in/lea-martins" },
  { what: "spaces around it", typed: "  https://www.linkedin.com/in/lea-martins  ", saved: "https://www.linkedin.com/in/lea-martins" },
  { what: "a trailing slash", typed: "https://www.linkedin.com/in/lea-martins/", saved: "https://www.linkedin.com/in/lea-martins" },
  { what: "without scheme", typed: "www.linkedin.com/in/lea-martins", saved: "https://www.linkedin.com/in/lea-martins" },
  { what: "without scheme and www", typed: "linkedin.com/in/lea-martins", saved: "https://www.linkedin.com/in/lea-martins" },
  { what: "http", typed: "http://www.linkedin.com/in/lea-martins", saved: "https://www.linkedin.com/in/lea-martins" },
  { what: "a country host", typed: "https://de.linkedin.com/in/lea-martins/", saved: "https://www.linkedin.com/in/lea-martins" },
  { what: "upper-case host", typed: "HTTPS://WWW.LinkedIn.com/in/Lea-Martins", saved: "https://www.linkedin.com/in/Lea-Martins" },
  { what: "a query and fragment from the share button", typed: "https://www.linkedin.com/in/lea-martins?utm_source=share#x", saved: "https://www.linkedin.com/in/lea-martins" },
  { what: "empty", typed: "", saved: null },
  { what: "only spaces", typed: "   ", saved: null },
  { what: "javascript:", typed: "javascript:alert(1)", saved: "refused" },
  { what: "javascript: with the link in it", typed: "javascript://www.linkedin.com/in/lea-martins", saved: "refused" },
  { what: "data:", typed: "data:text/html,<b>x</b>", saved: "refused" },
  { what: "ftp", typed: "ftp://www.linkedin.com/in/lea-martins", saved: "refused" },
  { what: "another host", typed: "https://evil.example/in/lea-martins", saved: "refused" },
  { what: "a host ending in linkedin.com", typed: "https://notlinkedin.com/in/lea-martins", saved: "refused" },
  { what: "a deeper subdomain", typed: "https://a.b.linkedin.com/in/lea-martins", saved: "refused" },
  { what: "user info before the host", typed: "https://www.linkedin.com@evil.example/in/lea-martins", saved: "refused" },
  { what: "a port", typed: "https://www.linkedin.com:8080/in/lea-martins", saved: "refused" },
  { what: "a company page", typed: "https://www.linkedin.com/company/lockedin", saved: "refused" },
  { what: "a path below the profile", typed: "https://www.linkedin.com/in/lea-martins/details/skills", saved: "refused" },
  { what: "two slashes at the end", typed: "https://www.linkedin.com/in/lea-martins//", saved: "refused" },
  { what: "a slug too short", typed: "linkedin.com/in/ab", saved: "refused" },
  { what: "only a name", typed: "Lea Martins", saved: "refused" },
  { what: "a dot in the slug", typed: "linkedin.com/in/lea.martins", saved: "refused" },
];
