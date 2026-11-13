// Tests for voice input's pure parts (R24): the starting language and joining heard with typed text.
import { describe, expect, it } from "vitest";
import { joinHeard, startLanguage } from "./voice";

describe("startLanguage", () => {
  it("keeps the language remembered in this browser", () => {
    expect(startLanguage("de-DE", ["en-US"])).toBe("de-DE");
    expect(startLanguage("en-US", ["de-DE"])).toBe("en-US");
  });

  it("starts in German when the browser's first language is German, else in English", () => {
    expect(startLanguage(null, ["de-DE", "en"])).toBe("de-DE");
    expect(startLanguage(undefined, ["de"])).toBe("de-DE");
    expect(startLanguage(null, ["de-AT"])).toBe("de-DE");
    expect(startLanguage(null, ["en-GB", "de-DE"])).toBe("en-US");
    expect(startLanguage(null, ["pt-PT"])).toBe("en-US");
    expect(startLanguage(null, [])).toBe("en-US");
  });

  it("ignores a remembered value that is not one of the two languages", () => {
    expect(startLanguage("fr-FR", ["de-DE"])).toBe("de-DE");
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
