// A profile's display name (spec 28, R42): 1 to 40 characters after trimming, without control
// characters or invisible characters that could disguise a name (zero-width marks, direction
// overrides, characters that render blank, characters invisible inside a word), at most two combining
// marks in a row, and with at least one letter or digit. The database checks the same rule
// (app.display_name_valid). Until the user sets one, the app shows the part of the e-mail address
// before the "@".

export const MAX_DISPLAY_NAME = 40;

/** The same characters app.display_name_valid refuses. */
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

/**
 * Characters that render blank (U+115F, U+1160, U+180E, U+2800, U+3164, U+FFA0) or are invisible inside
 * a word (soft hyphen, U+034F, U+061C, U+17B4, U+17B5, variation selectors, the tag block), as
 * app.display_name_valid.
 */
const INVISIBLE =
  /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u2800\u3164\ufe00-\ufe0f\uffa0\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/u;

/** Three combining marks in a row, in the same blocks the database names. */
const MARK_STACK = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{3}/u;

/**
 * A letter or digit, as the database's [[:alnum:]] in a UTF-8 locale: alphabetic characters (letters,
 * letter numbers such as roman numerals, and the vowel signs some scripts write as marks) and decimal
 * digits of any script.
 */
const LETTER_OR_DIGIT = /[\p{Alphabetic}\p{Nd}]/u;

/** The name as it is saved (trimmed), or null when it breaks the rule. */
export function cleanDisplayName(raw: string): string | null {
  const name = raw.trim();
  const length = [...name].length;
  if (length < 1 || length > MAX_DISPLAY_NAME || FORBIDDEN.test(name)) return null;
  if (INVISIBLE.test(name) || MARK_STACK.test(name) || !LETTER_OR_DIGIT.test(name)) return null;
  return name;
}

/** The name shown for a person: their display name, else the part of their address before the "@". */
export function shownName(displayName: string | null, email: string): string {
  if (displayName) return displayName;
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

/** Up to two initials for the circle without a photo: "Lea Martins" → "LM", "lea" → "L". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => [...w][0] ?? "");
  return letters.join("").toUpperCase() || "?";
}
