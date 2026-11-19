// After the session changed (signed in, signed out, account deleted) the next page is loaded in full,
// as the browser's Reload does, not through the framework's client-side router.
// Why (19 Nov 2026, reported by the owner): right after signing in, the client-side move to the calendar
// could end on the framework's error page ("This page couldn't load"), and Reload then showed the
// calendar. A full load cannot fail that way, and it also throws away everything the browser still held
// of the account before (cached pages, lists kept in memory), so the next account never sees it.

/** The path if it is one of this site's own ("/…", not "//host"), else the start page. */
export function ownPathOrStart(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

/** Loads `path` of this site in full, leaving the current page. */
export function openFresh(path: string): void {
  window.location.assign(ownPathOrStart(path));
}
