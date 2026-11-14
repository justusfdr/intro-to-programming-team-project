// An event's notes (issue #5, spec 27): the user's own text, kept in the app only (never sent to Outlook
// or to Claude). The same rules in the editor and on the server; the database checks them too
// (supabase/migrations/20261202000000_event_notes.sql).

/** At most this many characters (counted as characters, as the database's char_length does). */
export const MAX_NOTES = 2000;

/** The editor shows the count from this many characters on. */
export const NOTES_COUNT_FROM = 1800;

/** The number of characters (not UTF-16 units: an emoji counts once, as in the database). */
export function notesLength(text: string): number {
  return [...text].length;
}

/** The notes as they are saved: whitespace at the end trimmed (not at the start), empty is none (null). */
export function cleanNotes(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").trimEnd();
  return trimmed === "" ? null : trimmed;
}

/** True if the notes, as saved, would be longer than allowed. */
export function notesTooLong(text: string | null | undefined): boolean {
  return notesLength(cleanNotes(text) ?? "") > MAX_NOTES;
}
