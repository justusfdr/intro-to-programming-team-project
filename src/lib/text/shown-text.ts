// Text shown on a profile (the bio, spec 40): after trimming, 1 to the maximum number of characters,
// without control characters or invisible characters that could disguise the text (zero-width marks,
// direction overrides, characters that render blank, characters invisible inside a word), at most two
// combining marks in a row. Unlike a display name it needs no letter: one emoji is fine. The database
// checks the same rule (app.list_text_valid; the name comes from the migration that first used it).

const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

/** Characters that render blank or are invisible inside a word, as app.list_text_valid. */
const INVISIBLE =
  /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u2800\u3164\ufe00-\ufe0e\uffa0\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/u;

/** Three combining marks in a row, in the same blocks the database names. */
const MARK_STACK = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{3}/u;

/**
 * Any text under this rule, with its own maximum (a profile's bio, spec 40): the
 * text as it is saved (trimmed), or null when it breaks the rule.
 */
export function cleanShownText(raw: string, max: number): string | null {
  const text = raw.trim();
  const length = [...text].length;
  if (length < 1 || length > max || FORBIDDEN.test(text) || INVISIBLE.test(text) || MARK_STACK.test(text)) return null;
  return text;
}

/**
 * Another person's text as it may be shown (a shared event's title or place, security review L4): the
 * same characters the rule above refuses (control characters, zero-width marks, direction overrides and
 * isolates, characters that render blank or are invisible inside a word) are removed, so the text cannot
 * read as something else. Everything else, letters and emoji included, stays as it is.
 */
export function stripHiddenCharacters(text: string): string {
  return text.replace(new RegExp(FORBIDDEN.source, "g"), "").replace(new RegExp(INVISIBLE.source, "gu"), "");
}
