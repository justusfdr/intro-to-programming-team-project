// The goals sheet is hidden from 1280px (xl) on, but a modal dialog would still block the page. So the
// sheet is closed when the window becomes that wide.
export const XL_QUERY = "(min-width: 80rem)";

/** Calls `close` when the media query starts to match; returns the function that stops listening. */
export function closeWhenWide(query: Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">, close: () => void): () => void {
  const onChange = (event: { matches: boolean }) => {
    if (event.matches) close();
  };
  // Already wide when the sheet opens (it was hidden by the layout): close at once.
  if (query.matches) close();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
