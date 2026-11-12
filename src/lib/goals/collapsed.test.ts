// Collapsing goal sections in the goals column (spec 10): kept per goal, in the browser only.
import { describe, expect, it } from "vitest";
import { readCollapsed, toggleCollapsed } from "./collapsed";

describe("collapsed goals", () => {
  it("toggling collapses a goal, and toggling again expands it", () => {
    const once = toggleCollapsed([], "g1");
    expect(once).toEqual(["g1"]);
    expect(toggleCollapsed(once, "g2")).toEqual(["g1", "g2"]);
    expect(toggleCollapsed(once, "g1")).toEqual([]);
  });

  it("reads the stored list and keeps only goals that still exist", () => {
    expect(readCollapsed('["g1","gone","g2","g1"]', ["g1", "g2", "g3"])).toEqual(["g1", "g2"]);
  });

  it("gives an empty list for missing or broken data", () => {
    expect(readCollapsed(null, ["g1"])).toEqual([]);
    expect(readCollapsed("not json", ["g1"])).toEqual([]);
    expect(readCollapsed('{"g1":true}', ["g1"])).toEqual([]);
    expect(readCollapsed("[1,2]", ["g1"])).toEqual([]);
  });
});
