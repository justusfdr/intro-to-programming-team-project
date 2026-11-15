// The titles of shared lists and their entries (spec 30, R52, R54): seen by other people, so the same
// rule as a display name: after trimming, 1 to the maximum number of characters, without control
// characters or invisible characters that could disguise the text (zero-width marks, direction
// overrides, characters that render blank, characters invisible inside a word), at most two combining
// marks in a row. Unlike a name it needs no letter: an entry of one emoji is fine. The database checks
// the same rule (app.list_text_valid).
import { MAX_ENTRY_TITLE, MAX_LIST_TITLE } from "./types";

const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

/** Characters that render blank or are invisible inside a word, as app.list_text_valid. */
const INVISIBLE =
  /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u2800\u3164\ufe00-\ufe0e\uffa0\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/u;

/** Three combining marks in a row, in the same blocks the database names. */
const MARK_STACK = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{3}/u;

function clean(raw: string, max: number): string | null {
  const text = raw.trim();
  const length = [...text].length;
  if (length < 1 || length > max || FORBIDDEN.test(text) || INVISIBLE.test(text) || MARK_STACK.test(text)) return null;
  return text;
}

/** A list's title as it is saved (trimmed), or null when it breaks the rule. */
export function cleanListTitle(raw: string): string | null {
  return clean(raw, MAX_LIST_TITLE);
}

/** An entry's title as it is saved (trimmed), or null when it breaks the rule. */
export function cleanEntryTitle(raw: string): string | null {
  return clean(raw, MAX_ENTRY_TITLE);
}
