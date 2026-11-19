// The colours of shared calendars (spec 53, colours since 19 Nov 2026): a person keeps their colour,
// and the people shown together never share one.
import { describe, expect, it } from "vitest";
import { goalColor } from "@/lib/goals/colors";
import { GOAL_COLORS } from "@/lib/goals/style";
import { MAX_SHOWN_CALENDARS } from "./types";
import { SHARE_COLOR_NAMES, preferredColor, shareColor, shareColors } from "./colors";

const IDS = [
  "71d469bc-326f-487e-9548-14d2e9fc1e25",
  "4dabb1cd-028d-438e-9350-833fa69482f2",
  "0b6f1d0e-5a51-4f0c-9a3c-6f1f6a3d2b11",
  "c2a7f3de-88b1-4d55-a1f0-2e9d4b7c6a90",
  "9e1b2c3d-4f5a-4b6c-8d7e-0f1a2b3c4d5e",
  "a",
  "b",
  "c",
];

describe("the colours of shared calendars", () => {
  it("has a colour for each calendar that can be shown at once", () => {
    expect(SHARE_COLOR_NAMES.length).toBeGreaterThanOrEqual(MAX_SHOWN_CALENDARS);
  });

  it("gives the same person the same colour every time", () => {
    for (const id of IDS) {
      expect(SHARE_COLOR_NAMES).toContain(preferredColor(id));
      expect(preferredColor(id)).toBe(preferredColor(id));
      expect(shareColors([id])[id]).toBe(preferredColor(id));
    }
  });

  it("never gives two people shown together the same colour", () => {
    for (const a of IDS) {
      for (const b of IDS) {
        for (const c of IDS) {
          const chosen = [...new Set([a, b, c])];
          const colors = shareColors(chosen);
          expect(Object.keys(colors).sort()).toEqual([...chosen].sort());
          expect(new Set(Object.values(colors)).size).toBe(chosen.length);
        }
      }
    }
  });

  it("lets the person chosen first keep their own colour", () => {
    for (const a of IDS) for (const b of IDS) expect(shareColors([a, b])[a]).toBe(preferredColor(a));
  });

  it("uses no fill of a goal colour, so a shared block is not taken for a goal's event", () => {
    const goalFills = GOAL_COLORS.map((name) => goalColor(name).block.split(" ").find((c) => c.startsWith("bg-")));
    for (const name of SHARE_COLOR_NAMES) {
      const fill = shareColor(name).block.split(" ").find((c) => c.startsWith("bg-"));
      expect(fill).toBeDefined();
      expect(goalFills).not.toContain(fill);
    }
  });
});
