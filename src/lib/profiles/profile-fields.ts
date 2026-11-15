// The fields of the profile page (spec 40): display name, bio and LinkedIn link, checked the same way in
// the browser (the form) and on the server (the action). The database checks each again
// (app.set_profile).
import { cleanShownText } from "@/lib/text/shown-text";
import { MESSAGES } from "@/lib/messages";
import { cleanDisplayName } from "./display-name";
import { cleanLinkedIn } from "./linkedin";

export const MAX_BIO = 160;

/**
 * A bio as it is saved: null for empty input; otherwise 1 to 160 characters after trimming, on one line,
 * under the rule of shown text (no control characters, so no line breaks; no invisible characters; at
 * most two combining marks in a row; emoji are fine). "refused" when it breaks the rule.
 */
export function cleanBio(raw: string): string | null | "refused" {
  if (raw.trim() === "") return null;
  return cleanShownText(raw, MAX_BIO) ?? "refused";
}

export type ProfileField = "displayName" | "bio" | "linkedin";

/** What the form holds, as typed. */
export type ProfileDraft = { displayName: string; bio: string; linkedin: string };

/** What is saved. */
export type SavedProfileFields = { displayName: string | null; bio: string | null; linkedinUrl: string | null };

export type CleanProfile =
  | { ok: true; displayName: string | null; bio: string | null; linkedinUrl: string | null }
  | { ok: false; field: ProfileField; message: string };

/**
 * The three fields as they are saved, or the first one that is wrong (in the order of the form) with its
 * message. An empty name is allowed only while none was ever saved (`savedName` null): a name once set
 * cannot be emptied, as before.
 */
export function cleanProfile(draft: ProfileDraft, savedName: string | null): CleanProfile {
  let displayName: string | null = null;
  if (draft.displayName.trim() !== "" || savedName !== null) {
    displayName = cleanDisplayName(draft.displayName);
    if (!displayName) return { ok: false, field: "displayName", message: MESSAGES.displayName };
  }
  const bio = cleanBio(draft.bio);
  if (bio === "refused") return { ok: false, field: "bio", message: MESSAGES.bio };
  const linkedin = cleanLinkedIn(draft.linkedin);
  if (!linkedin.ok) return { ok: false, field: "linkedin", message: MESSAGES.linkedin };
  return { ok: true, displayName, bio, linkedinUrl: linkedin.url };
}

/** The form's fields for what is saved. */
export function draftOf(saved: SavedProfileFields): ProfileDraft {
  return { displayName: saved.displayName ?? "", bio: saved.bio ?? "", linkedin: saved.linkedinUrl ?? "" };
}

/**
 * Whether the form differs from what is saved, so the Save button shows (the pattern of the event
 * editor, spec 17). Spaces around a field do not count; taking a change back by hand hides it again.
 */
export function profileChanged(saved: SavedProfileFields, draft: ProfileDraft): boolean {
  const before = draftOf(saved);
  return (Object.keys(before) as ProfileField[]).some((field) => before[field].trim() !== draft[field].trim());
}
