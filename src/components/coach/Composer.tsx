"use client";

// The coach's input (spec 19): one rounded field that grows from one to about eight lines, the round
// black send button, and, in browsers with speech recognition, the microphone with the language
// switch (R24). Enter sends, Shift+Enter makes a new line (never while an input method is composing).
// Under it one line on what the coach sees, with "What is sent?" opening the list of R22.
import { useId, useLayoutEffect, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { startLanguage, VOICE_LANGUAGE_KEY, VOICE_LANGUAGES, type VoiceLanguage } from "@/lib/chat/voice";
import { useSpeech } from "./useSpeech";

const LINE_PX = 24;
const MAX_LINES = 8;
/** Padding of the field (top + bottom). */
const PAD_PX = 16;

export const SPEECH_NOTE =
  "Speech is turned into text by your browser, which may use an online service of the browser's maker. We receive only the text.";

// The chosen speech language, remembered in this browser (in memory when storage is blocked).
const LANGUAGE_CHANGED = "coach-voice-language-changed";
let languageInMemory: string | null = null;

function readLanguage(): string {
  try {
    return window.localStorage.getItem(VOICE_LANGUAGE_KEY) ?? languageInMemory ?? "";
  } catch {
    return languageInMemory ?? "";
  }
}

function subscribeLanguage(onChange: () => void) {
  window.addEventListener(LANGUAGE_CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LANGUAGE_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useVoiceLanguage(): [VoiceLanguage, (language: VoiceLanguage) => void] {
  const stored = useSyncExternalStore(subscribeLanguage, readLanguage, () => null);
  const language = stored === null ? "en-US" : startLanguage(stored || null, navigator.languages ?? [navigator.language]);
  const choose = (next: VoiceLanguage) => {
    languageInMemory = next;
    try {
      window.localStorage.setItem(VOICE_LANGUAGE_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
    window.dispatchEvent(new Event(LANGUAGE_CHANGED));
  };
  return [language, choose];
}

/** What is sent with every message (R22) and what is not, in words. */
export function WhatIsSent() {
  return (
    <div className="rounded-card border border-line-subtle bg-surface p-4 text-left text-xs leading-5 text-ink-2 shadow-float">
      <p className="font-semibold text-ink">Sent with every message to the AI service behind the coach</p>
      <ul className="mt-1 list-disc pl-4">
        <li>The last 10 messages of this chat, with the events of their drafts</li>
        <li>Your goals with their deadlines and rules</li>
        <li>Your events from today to 14 days ahead: title, start, end, whether they may overlap, all day</li>
        <li>Your weekly totals: time spent per goal</li>
        <li>Your time zone, the current date and time, and the hours your calendar shows</li>
      </ul>
      <p className="mt-2 font-semibold text-ink">Not sent</p>
      <p>Your e-mail address, your password, the locations of events, your block list, your tasks.</p>
      <p className="mt-2">{SPEECH_NOTE}</p>
    </div>
  );
}

type Props = {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  /** The field is off (not allowed, not set up, no messages left). */
  disabled: boolean;
  /** A message is on its way: the send button is off. */
  sending: boolean;
  /** An error from the microphone, in plain words. */
  onVoiceError: (message: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Opens "What is sent?" at once (previews only). */
  defaultShowSent?: boolean;
};

export function Composer({ value, onChange, onSend, disabled, sending, onVoiceError, inputRef, defaultShowSent = false }: Props) {
  const uid = useId();
  const [showSent, setShowSent] = useState(defaultShowSent);
  const [language, setLanguage] = useVoiceLanguage();
  const speech = useSpeech({ language, onText: onChange, onError: onVoiceError });
  const canSend = !disabled && !sending && value.trim() !== "";

  // Grow with the text, up to about eight lines; then the field scrolls.
  useLayoutEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, LINE_PX * MAX_LINES + PAD_PX)}px`;
  }, [value, inputRef]);

  function send() {
    if (!canSend) return;
    speech.stop();
    onSend();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    send();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div id={`${uid}-sent`} hidden={!showSent} className="mb-2">
        <WhatIsSent />
      </div>
      <div
        className={`flex items-end gap-1.5 rounded-[26px] border border-line bg-surface p-1.5 shadow-float transition-colors focus-within:border-ink/30 ${
          disabled ? "opacity-60" : ""
        }`}
      >
        {speech.supported && (
          <div className="flex shrink-0 items-center gap-1 self-end">
            <button
              type="button"
              aria-label={speech.listening ? "Stop listening" : "Speak"}
              aria-pressed={speech.listening}
              disabled={disabled}
              onClick={() => (speech.listening ? speech.stop() : speech.start(value))}
              className={`relative flex size-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:pointer-events-none ${
                speech.listening ? "bg-danger text-white" : "text-ink-2 hover:bg-raised hover:text-ink"
              }`}
            >
              {speech.listening && <span aria-hidden className="absolute inset-0 rounded-full bg-danger/40 motion-safe:animate-ping" />}
              <Mic className="relative size-[18px]" />
            </button>
            <div role="group" aria-label="Speech language" className="flex h-7 items-center rounded-full bg-raised p-0.5 text-[10px] font-semibold">
              {VOICE_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  aria-label={l.name}
                  aria-pressed={language === l.code}
                  disabled={speech.listening}
                  onClick={() => setLanguage(l.code)}
                  className={`h-6 rounded-full px-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
                    language === l.code ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <label htmlFor={`${uid}-text`} className="sr-only">
          Message to the coach
        </label>
        <textarea
          id={`${uid}-text`}
          ref={inputRef}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder="Tell the coach about your day…"
          onChange={(event) => {
            // Typing takes over from listening; the text so far stays.
            if (speech.listening) speech.stop();
            onChange(event.target.value);
          }}
          onKeyDown={onKeyDown}
          className="scroll-thin min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!canSend}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-[background-color,opacity] hover:bg-ink/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-30"
        >
          <ArrowUp className="size-[18px]" strokeWidth={2.4} />
        </button>
      </div>
      <p className="mt-1.5 text-center text-[11px] leading-4 text-ink-3">
        The coach sees your goals, your next 14 days and your weekly totals.{" "}
        <button
          type="button"
          aria-expanded={showSent}
          aria-controls={`${uid}-sent`}
          onClick={() => setShowSent((shown) => !shown)}
          className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        >
          What is sent?
        </button>
      </p>
    </form>
  );
}
