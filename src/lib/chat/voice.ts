// The parts of voice input (R24) that need no browser: which language to start with, and how heard
// text joins what is already typed. The browser's own speech recognition does the listening
// (src/components/coach/useSpeech.ts); our server only ever receives the text in the field.

export type VoiceLanguage = "en-US" | "de-DE";

export const VOICE_LANGUAGES: { code: VoiceLanguage; label: string; name: string }[] = [
  { code: "en-US", label: "EN", name: "English" },
  { code: "de-DE", label: "DE", name: "German" },
];

/** The key under which the browser remembers the chosen language. */
export const VOICE_LANGUAGE_KEY = "coach-voice-language";

export function isVoiceLanguage(value: unknown): value is VoiceLanguage {
  return value === "en-US" || value === "de-DE";
}

/**
 * The language to start with: the one remembered in this browser, else German when the browser's
 * first language is German, else English.
 */
export function startLanguage(stored: string | null | undefined, browserLanguages: readonly string[]): VoiceLanguage {
  if (isVoiceLanguage(stored)) return stored;
  const first = browserLanguages[0]?.toLowerCase() ?? "";
  return first === "de" || first.startsWith("de-") ? "de-DE" : "en-US";
}

/**
 * The field's text while listening: what was there when listening began, then what has been heard
 * so far, with one space between them (none when either is empty, no doubled spaces).
 */
export function joinHeard(typed: string, heard: string): string {
  const said = heard.trim().replace(/\s+/g, " ");
  if (!said) return typed;
  if (!typed.trim()) return said;
  return /\s$/.test(typed) ? `${typed}${said}` : `${typed} ${said}`;
}
