// Listening for the coach's voice input (R24), without React: starting and ending the browser's speech
// recognition, turning what it hears into the field's text, and dropping what it still delivers after
// listening was discarded (spec 44). src/components/coach/useSpeech.ts wraps it for the screen; the
// tests drive it with a stand-in recognition.
//
// Spec 44, the fix: the browser keeps delivering what it heard for a moment after it was told to stop.
// On send and when the user types, `discard` ends listening at once and drops everything that still
// arrives, so a sent message does not come back into the field and typed text is not overwritten. A
// second click on the microphone (`stop`) lets the last words still arrive.
import { joinHeard, VOICE_LANGUAGE } from "@/lib/chat/voice";

// The few parts of the Web Speech API used here (not in TypeScript's DOM types).
type Alternative = { transcript: string };
type Result = { readonly length: number; [index: number]: Alternative };
export type ResultEvent = { results: { readonly length: number; [index: number]: Result } };
export type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: ResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onaudiostart: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

export const MIC_NOT_ALLOWED = "Allow the microphone for this site in your browser's settings.";
export const SPEECH_UNAVAILABLE = "Speech input is not available right now. Please type instead.";

/** Plain words for the browser's error codes; null when nothing needs saying (nothing heard, stopped). */
export function errorWords(code: string): string | null {
  if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") return MIC_NOT_ALLOWED;
  if (code === "no-speech" || code === "aborted") return null;
  return SPEECH_UNAVAILABLE;
}

/** Listening: on while the recognition runs; hearing once the browser has the microphone. */
export type ListeningState = { listening: boolean; hearing: boolean };

export type ListeningEvents = {
  /** The field's whole new text while listening. */
  onText: (text: string) => void;
  /** An error in plain words. */
  onError: (message: string) => void;
  /** Listening or hearing changed. */
  onState: (state: ListeningState) => void;
};

/**
 * One microphone's listening. `make` creates the browser's recognition (it may throw); `events` is
 * read at the moment something happens, so the screen can hand in its latest callbacks.
 */
export function createListening(make: () => Recognition, events: () => ListeningEvents) {
  let current: Recognition | null = null;
  let session: { dropped: boolean } | null = null;

  const set = (state: ListeningState) => events().onState(state);

  return {
    /** Starts listening; what is heard goes after `typed`. Does nothing while already listening. */
    start(typed: string) {
      if (current) return;
      let recognition: Recognition;
      try {
        recognition = make();
      } catch {
        events().onError(SPEECH_UNAVAILABLE);
        return;
      }
      const mine = { dropped: false };
      recognition.lang = VOICE_LANGUAGE;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        if (mine.dropped) return;
        // All results of this listening so far, final and interim, in order.
        let heard = "";
        for (let i = 0; i < event.results.length; i++) heard += `${event.results[i][0]?.transcript ?? ""} `;
        events().onText(joinHeard(typed, heard));
      };
      recognition.onerror = (event) => {
        if (mine.dropped) return;
        const words = errorWords(event.error);
        if (words) events().onError(words);
      };
      recognition.onaudiostart = () => {
        if (!mine.dropped && current === recognition) set({ listening: true, hearing: true });
      };
      recognition.onend = () => {
        // A listening that was discarded has already been let go; a newer one may be running.
        if (current !== recognition) return;
        current = null;
        session = null;
        set({ listening: false, hearing: false });
      };
      try {
        recognition.start();
      } catch {
        events().onError(SPEECH_UNAVAILABLE);
        return;
      }
      current = recognition;
      session = mine;
      set({ listening: true, hearing: false });
    },

    /** Ends listening; the last words the browser still delivers go into the field. */
    stop() {
      current?.stop();
    },

    /** Ends listening at once and drops whatever the browser still delivers (on send, on typing). */
    discard() {
      const recognition = current;
      if (!recognition) return;
      if (session) session.dropped = true;
      current = null;
      session = null;
      set({ listening: false, hearing: false });
      recognition.abort();
    },
  };
}
