// The titles of shared lists and their entries (spec 30, R52, R54): seen by other people, so the same
// rule as a display name: after trimming, 1 to the maximum number of characters, without control
// characters or invisible characters that could disguise the text (zero-width marks, direction
// overrides). The database checks the same rule (app.list_text_valid).
import { MAX_ENTRY_TITLE, MAX_LIST_TITLE } from "./types";

const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

function clean(raw: string, max: number): string | null {
  const text = raw.trim();
  const length = [...text].length;
  if (length < 1 || length > max || FORBIDDEN.test(text)) return null;
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
