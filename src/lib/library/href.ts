// Addresses of the library's pages (spec 29). Kept apart from the articles, so a screen that only
// links to the library does not carry their text.

export const LIBRARY_HREF = "/focus/library";

/** The address of an article. */
export function articleHref(slug: string): string {
  return `${LIBRARY_HREF}/${slug}`;
}

/** The library showing one shelf, or all of it. */
export function shelfHref(topic: string | null): string {
  return topic ? `${LIBRARY_HREF}?topic=${topic}` : LIBRARY_HREF;
}
