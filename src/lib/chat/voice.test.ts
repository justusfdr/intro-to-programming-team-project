// Tests for voice input's pure parts (R24, spec 44): the language, joining heard with typed text, and how
// loud the microphone is for the wave.
import { describe, expect, it } from "vitest";
import { joinHeard, loudness, VOICE_LANGUAGE } from "./voice";

describe("the language (spec 44)", () => {
  it("listens for English only", () => {
    expect(VOICE_LANGUAGE).toBe("en-US");
  });
});

describe("joinHeard", () => {
  it("adds heard text after typed text with one space", () => {
    expect(joinHeard("Tomorrow", "I want to study 4 hours")).toBe("Tomorrow I want to study 4 hours");
    expect(joinHeard("Tomorrow ", "I want to study")).toBe("Tomorrow I want to study");
    expect(joinHeard("Line one\n", "line two")).toBe("Line one\nline two");
  });

  it("uses only the heard text in an empty field, and leaves the field alone when nothing was heard", () => {
    expect(joinHeard("", "  morgen vier Stunden lernen ")).toBe("morgen vier Stunden lernen");
    expect(joinHeard("   ", "hello")).toBe("hello");
    expect(joinHeard("Typed", "   ")).toBe("Typed");
  });

  it("squeezes the spaces between heard pieces", () => {
    expect(joinHeard("", "study  four   hours")).toBe("study four hours");
  });
});

describe("loudness (the wave, spec 44)", () => {
  it("is 0 for silence, for quiet room noise and for no samples", () => {
    expect(loudness(new Uint8Array(256).fill(128))).toBe(0);
    expect(loudness(Uint8Array.from({ length: 256 }, (_, i) => (i % 2 ? 129 : 127)))).toBe(0);
    expect(loudness([])).toBe(0);
  });

  it("grows with the voice and stops at 1", () => {
    const wave = (amplitude: number) => Uint8Array.from({ length: 256 }, (_, i) => Math.round(128 + amplitude * Math.sin(i / 4)));
    const quiet = loudness(wave(10));
    const loud = loudness(wave(40));
    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(quiet);
    expect(loudness(wave(127))).toBe(1);
  });
});
