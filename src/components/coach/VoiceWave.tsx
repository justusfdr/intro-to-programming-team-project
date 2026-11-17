"use client";

// The wave next to the microphone while the coach listens (spec 44): a row of dots that rise into bars
// with the voice and move to the left as time goes on, the newest on the right. It reads the
// microphone's loudness in the browser only (the Web Audio API); nothing is recorded or sent. Until
// the browser's speech recognition has the microphone it shows still dots; where the loudness cannot
// be read (no permission, an old browser) or should not be (phones and tablets, iPhone, iPad and
// Android, where a second use of the microphone can stop the speech recognition) the dots breathe one
// after another instead. With reduced motion the dots stay still.
import { useEffect, useRef, useState } from "react";
import { loudness } from "@/lib/chat/voice";

const BARS = 24;
/** On a phone only the newest bars show, so the field keeps its room. */
const PHONE_BARS = 14;
const MIN_PX = 3;
const MAX_PX = 22;
/** A new bar every this many milliseconds; each shows the loudest moment since the last one. */
const STEP_MS = 75;

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  const w = window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Phones and tablets: a touch screen as the main pointer, iPhone and iPad (also an iPad that says it is a Mac), Android. */
function isTouchDevice(): boolean {
  return (
    (window.matchMedia?.("(pointer: coarse)").matches ?? false) ||
    /iP(hone|ad|od)|Android/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1)
  );
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function VoiceWave({ hearing }: { hearing: boolean }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!hearing || reducedMotion()) return;
    let stopped = false;
    let frame = 0;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    const levels: number[] = new Array(BARS).fill(0);

    const draw = () => {
      levels.forEach((level, i) => {
        const bar = bars.current[i];
        if (bar) bar.style.height = `${Math.round(MIN_PX + level * (MAX_PX - MIN_PX))}px`;
      });
    };

    const listen = async () => {
      const Context = audioContextConstructor();
      if (!navigator.mediaDevices?.getUserMedia || !Context || isTouchDevice()) {
        setIdle(true);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        if (!stopped) setIdle(true);
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      context = new Context();
      // Some browsers start an audio context paused.
      void context.resume().catch(() => {});
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let loudest = 0;
      let last = 0;
      const tick = (time: number) => {
        if (stopped) return;
        analyser.getByteTimeDomainData(samples);
        loudest = Math.max(loudest, loudness(samples));
        if (time - last >= STEP_MS) {
          levels.shift();
          levels.push(loudest);
          loudest = 0;
          last = time;
          draw();
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    void listen();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close().catch(() => {});
      levels.fill(0);
      draw();
    };
  }, [hearing]);

  return (
    <div aria-hidden className={`flex h-9 shrink-0 items-center gap-[3px] px-1 ${idle ? "voice-idle" : ""}`}>
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className={`voice-bar block w-[3px] rounded-full bg-ink-2 ${i < BARS - PHONE_BARS ? "max-sm:hidden" : ""}`}
          style={{ height: MIN_PX, ["--i" as string]: i }}
        />
      ))}
    </div>
  );
}
