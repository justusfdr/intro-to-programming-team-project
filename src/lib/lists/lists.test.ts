// The titles' rule (R52, R54) and the order a list is shown in (spec 30).
import { describe, expect, it } from "vitest";
import { movedTo, shownOrder, stepTarget } from "./order";
import { cleanEntryTitle, cleanListTitle } from "./text";
import type { ListEntry } from "./types";

describe("cleanListTitle and cleanEntryTitle", () => {
  it("trim and accept 1 to 60 and 1 to 200 characters, also accents and emoji", () => {
    expect(cleanListTitle("  Flat shopping ")).toBe("Flat shopping");
    expect(cleanListTitle("é".repeat(59) + "🛒")).toBe("é".repeat(59) + "🛒");
    expect(cleanEntryTitle("x".repeat(200))).toBe("x".repeat(200));
  });

  it("refuse empty, too long, control and invisible characters", () => {
    for (const bad of ["", "   ", "a".repeat(61), "Fl\u0007at", "\u202etalF", "Fl\u200bat"]) expect(cleanListTitle(bad)).toBeNull();
    for (const bad of ["", "x".repeat(201), "Mi\nlk"]) expect(cleanEntryTitle(bad)).toBeNull();
  });
});

const entry = (id: string, position: number, done = false): ListEntry => ({
  id,
  title: id,
  done,
  position,
  updatedAt: "2026-11-16T09:00:00.000Z",
  addedBy: null,
  doneBy: null,
});

describe("the order of a list", () => {
  const list = [entry("a", 0), entry("b", 1, true), entry("c", 2), entry("d", 3, true), entry("e", 4)];

  it("shows the open entries first, then the done ones, each in the list's order", () => {
    expect(shownOrder(list).map((e) => e.id)).toEqual(["a", "c", "e", "b", "d"]);
  });

  it("moves an entry past its neighbour in its own group, and not past the ends", () => {
    expect(stepTarget(list, "c", -1)).toBe(0);
    expect(stepTarget(list, "c", 1)).toBe(4);
    expect(stepTarget(list, "a", -1)).toBeNull();
    expect(stepTarget(list, "e", 1)).toBeNull();
    expect(stepTarget(list, "d", -1)).toBe(1);
    expect(stepTarget(list, "missing", 1)).toBeNull();
  });

  it("puts an entry at its new place and closes up the others", () => {
    expect(movedTo(list, "c", 0).map((e) => [e.id, e.position])).toEqual([["c", 0], ["a", 1], ["b", 2], ["d", 3], ["e", 4]]);
    expect(movedTo(list, "a", 99).map((e) => e.id)).toEqual(["b", "c", "d", "e", "a"]);
  });
});
