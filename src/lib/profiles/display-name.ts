// A profile's display name (spec 28, R42): 1 to 40 characters after trimming, without control
// characters or invisible characters that could disguise a name (zero-width marks, direction
// overrides). The database checks the same rule (app.display_name_valid). Until the user sets one,
// the app shows the part of the e-mail address before the "@".

export const MAX_DISPLAY_NAME = 40;

/** The same characters app.display_name_valid refuses. */
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

/** The name as it is saved (trimmed), or null when it breaks the rule. */
export function cleanDisplayName(raw: string): string | null {
  const name = raw.trim();
  const length = [...name].length;
  if (length < 1 || length > MAX_DISPLAY_NAME || FORBIDDEN.test(name)) return null;
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
