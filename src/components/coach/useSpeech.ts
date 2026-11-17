"use client";

// Voice input for the coach (R24): the browser's own speech recognition, nothing else (no service of
// ours, no package), in English (spec 44). What is heard goes into the editable field, live, after
// what was already typed; it is never sent by itself. Listening stops on a second click, on send, when
// the user types, when the page is left, and when the browser ends it. The listening itself (and the
// spec 44 fix: nothing comes back into the field after sending) is in src/lib/chat/listening.ts.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createListening, type Recognition } from "@/lib/chat/listening";

export { MIC_NOT_ALLOWED, SPEECH_UNAVAILABLE } from "@/lib/chat/listening";

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};
const hasRecognition = () => recognitionConstructor() !== null;

type Options = {
  /** Called with the field's whole new text while listening. */
  onText: (text: string) => void;
  /** Called with an error in plain words. */
  onError: (message: string) => void;
};

export function useSpeech({ onText, onError }: Options) {
  // Known only in the browser (the server and the first render show no microphone).
  const supported = useSyncExternalStore(noSubscribe, hasRecognition, () => false);
  const [state, setState] = useState({ listening: false, hearing: false });
  const callbacks = useRef({ onText, onError });
  useEffect(() => {
    callbacks.current = { onText, onError };
  });

  // Made on the first click on the microphone (event handlers only, never while rendering).
  const listeningRef = useRef<ReturnType<typeof createListening> | null>(null);
  const listening = useCallback(
    () =>
      (listeningRef.current ??= createListening(
        () => {
          const Ctor = recognitionConstructor();
          if (!Ctor) throw new Error("No speech recognition in this browser");
          return new Ctor();
        },
        () => ({ onText: callbacks.current.onText, onError: callbacks.current.onError, onState: setState }),
      )),
    [],
  );
  const start = useCallback((typed: string) => listening().start(typed), [listening]);
  const stop = useCallback(() => listeningRef.current?.stop(), []);
  const discard = useCallback(() => listeningRef.current?.discard(), []);

  // Leaving the page (or the tab going away) ends listening.
  useEffect(() => {
    window.addEventListener("pagehide", discard);
    return () => {
      window.removeEventListener("pagehide", discard);
      discard();
    };
  }, [discard]);

  return {
    supported,
    listening: state.listening,
    /** The browser has the microphone: from then on the wave may read it too. */
    hearing: state.hearing,
    start,
    stop,
    discard,
  };
}
