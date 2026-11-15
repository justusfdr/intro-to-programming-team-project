// Text other people see (a profile's bio, spec 31): after trimming, 1 to the maximum number of
// characters, without control characters or invisible characters that could disguise the text
// (zero-width marks, direction overrides, characters that render blank, characters invisible inside a
// word), at most two combining marks in a row. Unlike a display name it needs no letter: one emoji is
// fine. The database checks the same rule (app.list_text_valid, named after the shared lists of spec 30
// that first used it; the lists are withdrawn, spec 34, the check stays).

const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

/** Characters that render blank or are invisible inside a word, as app.list_text_valid. */
const INVISIBLE =
  /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u2800\u3164\ufe00-\ufe0e\uffa0\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/u;

/** Three combining marks in a row, in the same blocks the database names. */
const MARK_STACK = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{3}/u;

/**
 * Any text other people see under this rule, with its own maximum (a profile's bio, spec 31): the
 * text as it is saved (trimmed), or null when it breaks the rule.
 */
export function cleanShownText(raw: string, max: number): string | null {
  const text = raw.trim();
  const length = [...text].length;
  if (length < 1 || length > max || FORBIDDEN.test(text) || INVISIBLE.test(text) || MARK_STACK.test(text)) return null;
  return text;
}
