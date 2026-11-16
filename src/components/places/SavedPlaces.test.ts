import { describe, expect, it } from "vitest";
import { savedMatches, withSaved } from "./SavedPlaces";

const PLACES = [
  { id: "1", name: "Gym", address: "Rua do Ginasio 5" },
  { id: "2", name: "Uni", address: "Campus 1" },
];

describe("saved places as suggestions", () => {
  it("offers the address of each place whose name starts with what is typed, in any case", () => {
    expect(savedMatches("gy", PLACES)).toEqual([{ label: "Rua do Ginasio 5" }]);
    expect(savedMatches("UNI", PLACES)).toEqual([{ label: "Campus 1" }]);
    expect(savedMatches("", PLACES)).toEqual([]);
    expect(savedMatches("Rua", PLACES)).toEqual([]);
  });

  it("puts them before the search's suggestions, each address once", () => {
    expect(withSaved("Gym", PLACES, [{ label: "Gym Street 1" }, { label: "Rua do Ginasio 5" }])).toEqual([{ label: "Rua do Ginasio 5" }, { label: "Gym Street 1" }]);
  });
});
