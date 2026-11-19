// Spec 54 (changed 19 Nov 2026 after the owner tried it with two accounts): a page re-reads its own data
// when the window gets the focus back or the tab becomes visible again, so an invitation made a minute
// ago shows without Reload. At most once every 10 seconds: focus and visibility often come together,
// and switching back and forth quickly should not send a request each time.

/** The least time between two such re-reads. */
export const REFRESH_GAP_MS = 10_000;

/** Whether to re-read now, given when the page was last read this way (or loaded). A clock that went back re-reads too. */
export function shouldRefresh(lastAt: number, now: number): boolean {
  return now < lastAt || now - lastAt >= REFRESH_GAP_MS;
}
