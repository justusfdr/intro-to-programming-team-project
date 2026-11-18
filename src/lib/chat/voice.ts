// The parts of voice input (R24) that need no browser: the language, how heard text joins what is
// already typed, and how loud the microphone is for the wave drawn while listening. The browser's own
// speech recognition does the listening (src/components/coach/useSpeech.ts); our server only ever
// receives the text in the field.

/** Spec 44: the coach is English only; the browser listens for English. */
export const VOICE_LANGUAGE = "en-US";

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

/**
 * How loud one moment of the microphone is, from 0 (silence) to 1, for the wave (spec 44). `samples`
 * is the browser's time-domain data (128 is silence, 0 and 255 the loudest). Quiet room noise below a
 * floor counts as silence; normal speech fills most of the range.
 */
export function loudness(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = (samples[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / samples.length);
  const FLOOR = 0.02;
  const FULL = 0.3;
  return Math.min(1, Math.max(0, (rms - FLOOR) / (FULL - FLOOR)));
}
