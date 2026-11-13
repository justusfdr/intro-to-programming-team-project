"use client";

// Voice input for the coach (R24): the browser's own speech recognition, nothing else (no service of
// ours, no package). What is heard goes into the editable field, live, after what was already typed;
// it is never sent by itself. Listening stops on a second click, on send, when the user types, when the
// page is left, and when the browser ends it. The pure parts are in src/lib/chat/voice.ts.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { joinHeard, type VoiceLanguage } from "@/lib/chat/voice";

// The few parts of the Web Speech API used here (not in TypeScript's DOM types).
type Alternative = { transcript: string };
type Result = { readonly length: number; [index: number]: Alternative };
type ResultEvent = { results: { readonly length: number; [index: number]: Result } };
type ErrorEvent = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: ResultEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};
const hasRecognition = () => recognitionConstructor() !== null;

export const MIC_NOT_ALLOWED = "Allow the microphone for this site in your browser's settings.";
export const SPEECH_UNAVAILABLE = "Speech input is not available right now. Please type instead.";

/** Plain words for the browser's error codes; null when nothing needs saying (nothing heard, stopped). */
function errorWords(code: string): string | null {
  if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") return MIC_NOT_ALLOWED;
  if (code === "no-speech" || code === "aborted") return null;
  return SPEECH_UNAVAILABLE;
}

type Options = {
  language: VoiceLanguage;
  /** Called with the field's whole new text while listening. */
  onText: (text: string) => void;
  /** Called with an error in plain words. */
  onError: (message: string) => void;
};

export function useSpeech({ language, onText, onError }: Options) {
  // Known only in the browser (the server and the first render show no microphone).
  const supported = useSyncExternalStore(noSubscribe, hasRecognition, () => false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const callbacks = useRef({ onText, onError });
  useEffect(() => {
    callbacks.current = { onText, onError };
  });

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(
    (typed: string) => {
      const Ctor = recognitionConstructor();
      if (!Ctor || recognitionRef.current) return;
      let recognition: Recognition;
      try {
        recognition = new Ctor();
      } catch {
        callbacks.current.onError(SPEECH_UNAVAILABLE);
        return;
      }
      recognition.lang = language;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        // All results of this listening so far, final and interim, in order.
        let heard = "";
        for (let i = 0; i < event.results.length; i++) heard += `${event.results[i][0]?.transcript ?? ""} `;
        callbacks.current.onText(joinHeard(typed, heard));
      };
      recognition.onerror = (event) => {
        const words = errorWords(event.error);
        if (words) callbacks.current.onError(words);
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setListening(false);
      };
      try {
        recognition.start();
      } catch {
        callbacks.current.onError(SPEECH_UNAVAILABLE);
        return;
      }
      recognitionRef.current = recognition;
      setListening(true);
    },
    [language],
  );

  // Leaving the page (or the tab going away) ends listening.
  useEffect(() => {
    const end = () => recognitionRef.current?.abort();
    window.addEventListener("pagehide", end);
    return () => {
      window.removeEventListener("pagehide", end);
      end();
    };
  }, []);

  return { supported, listening, start, stop };
}
