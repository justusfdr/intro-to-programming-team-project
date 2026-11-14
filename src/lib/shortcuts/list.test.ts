// Spec 26: the help lists only shortcuts that really exist, and "?" never fires while typing.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shortcutFor } from "@/lib/events/views";
import { isHelpKey, keyLabel, mayUseShortcut, SHORTCUTS } from "./list";

const press = (key: string, more: Partial<{ target: unknown; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key,
  target: null as EventTarget | null,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...more,
} as { key: string; target: EventTarget | null; ctrlKey: boolean; metaKey: boolean; altKey: boolean });

const field = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable }) as unknown as EventTarget;

describe("the help key", () => {
  it("opens with ? on the page, also with Shift held (which ? needs)", () => {
    expect(isHelpKey(press("?"))).toBe(true);
    expect(isHelpKey(press("?", { target: field("BUTTON") }))).toBe(true);
    expect(isHelpKey(press("?", { target: field("BODY") }))).toBe(true);
  });

  it("does not open while typing in a field", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT", "input"]) expect(isHelpKey(press("?", { target: field(tag) }))).toBe(false);
    expect(isHelpKey(press("?", { target: field("DIV", true) }))).toBe(false);
  });

  it("does not open with Ctrl, Cmd or Alt held, or on another key", () => {
    expect(isHelpKey(press("?", { ctrlKey: true }))).toBe(false);
    expect(isHelpKey(press("?", { metaKey: true }))).toBe(false);
    expect(isHelpKey(press("?", { altKey: true }))).toBe(false);
    expect(isHelpKey(press("/"))).toBe(false);
    expect(isHelpKey(press("h"))).toBe(false);
  });

  it("the general rule: allowed on the page, refused in fields and with modifiers", () => {
    expect(mayUseShortcut(press("x"))).toBe(true);
    expect(mayUseShortcut(press("x", { target: field("TEXTAREA") }))).toBe(false);
    expect(mayUseShortcut(press("x", { metaKey: true }))).toBe(false);
  });
});

describe("the list of shortcuts", () => {
  const all = SHORTCUTS.flatMap((g) => g.shortcuts.map((s) => ({ ...s, where: g.where })));

  it("names, for every key, a file whose code handles that key", () => {
    for (const s of all) {
      const code = readFileSync(s.source, "utf8");
      for (const key of s.keys) {
        // The calendar letters are matched in either case ("d" and "D").
        const literal = new RegExp(`["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i");
        expect(code, `${s.where}: ${key} in ${s.source}`).toMatch(literal);
      }
    }
  });

  it("lists exactly the calendar keys that shortcutFor knows", () => {
    const listed = SHORTCUTS.find((g) => g.where === "Calendar")!.shortcuts.flatMap((s) => s.keys).filter((k) => k !== "Escape");
    const plain = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
    for (const key of listed) expect(shortcutFor({ key, ...plain }), key).not.toBeNull();
    // Every key shortcutFor reacts to is listed (letters, digits and the arrows tried).
    const candidates = [..."abcdefghijklmnopqrstuvwxyz0123456789", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
    const known = candidates.filter((key) => shortcutFor({ key, ...plain }) !== null);
    expect(known.sort()).toEqual([...listed].sort());
  });

  it("has the help key itself, and no entry without keys or words", () => {
    expect(all.some((s) => s.keys.includes("?"))).toBe(true);
    for (const s of all) {
      expect(s.keys.length).toBeGreaterThan(0);
      expect(s.does.trim()).not.toBe("");
    }
  });

  it("shows keys as keycaps", () => {
    expect(keyLabel("d")).toBe("D");
    expect(keyLabel("ArrowLeft")).toBe("←");
    expect(keyLabel("Escape")).toBe("Esc");
    expect(keyLabel("?")).toBe("?");
  });
});
