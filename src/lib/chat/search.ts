// Searching the coach's chats (spec 44): which words are searched for, how they become database
// patterns, the excerpt around a hit, and the pieces to mark on the screen. No browser or database
// needed here; the server's query is in src/lib/server/chat/rows.ts (searchOwnChats).

/** A search is at most this long (characters, after trimming). */
export const SEARCH_MAX_CHARS = 100;
/** At most this many words count; more are ignored. */
export const SEARCH_MAX_WORDS = 8;
/** At most this many chats come back, newest first. */
export const SEARCH_RESULTS = 30;

/**
 * The words searched for: split at white space, each once (ignoring case), at most 8. An empty search
 * has no words; a search longer than 100 characters is null (refused).
 */
export function searchWords(query: string): string[] | null {
  const trimmed = query.trim();
  if (Array.from(trimmed).length > SEARCH_MAX_CHARS) return null;
  const words: string[] = [];
  for (const word of trimmed.split(/\s+/)) {
    if (word === "" || words.some((w) => w.toLowerCase() === word.toLowerCase())) continue;
    words.push(word);
    if (words.length === SEARCH_MAX_WORDS) break;
  }
  return words;
}

/**
 * One ILIKE pattern per word, matching it anywhere. % and _ (and the escape character itself) are
 * escaped, so they are searched for as they are typed, never as wildcards.
 */
export function likePatterns(words: readonly string[]): string[] {
  return words.map((word) => `%${word.replace(/[\\%_]/g, "\\$&")}%`);
}

const lower = (text: string) => text.toLowerCase();

/**
 * A short piece of a message around the first hit: on one line, about 40 characters before it and 100
 * after, cut at spaces, with "…" where text was left out.
 */
export function excerptOf(text: string, words: readonly string[], before = 40, after = 100): string {
  const line = text.replace(/\s+/g, " ").trim();
  const haystack = lower(line);
  const hits = words.map((w) => haystack.indexOf(lower(w))).filter((i) => i >= 0);
  const hit = hits.length > 0 ? Math.min(...hits) : 0;
  let start = Math.max(0, hit - before);
  let end = Math.min(line.length, hit + after);
  if (start > 0) {
    const space = line.indexOf(" ", start);
    start = space >= 0 && space < hit ? space + 1 : start;
  }
  if (end < line.length) {
    const space = line.lastIndexOf(" ", end);
    end = space > hit ? space : end;
  }
  return `${start > 0 ? "…" : ""}${line.slice(start, end)}${end < line.length ? "…" : ""}`;
}

/** The text in pieces, each a hit of one of the words (ignoring case) or not, to mark the hits. */
export function hitParts(text: string, words: readonly string[]): { text: string; hit: boolean }[] {
  const usable = words.filter((w) => w !== "");
  if (usable.length === 0) return [{ text, hit: false }];
  // Longer words first, so "study" wins over "stud" where both match.
  const pattern = new RegExp(`(${[...usable].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text
    .split(pattern)
    .filter((piece) => piece !== "")
    .map((piece) => ({ text: piece, hit: usable.some((w) => lower(w) === lower(piece)) }));
}
