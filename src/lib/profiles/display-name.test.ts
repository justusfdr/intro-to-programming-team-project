// The display name (spec 40, R42): 1 to 40 characters after trimming, no control characters; until it
// is set, the part of the address before the "@".
import { describe, expect, it } from "vitest";
import { cleanDisplayName, initialsOf, shownName } from "./display-name";

describe("cleanDisplayName", () => {
  it("trims and accepts 1 to 40 characters, also accents and emoji", () => {
    expect(cleanDisplayName("  Lea Martins ")).toBe("Lea Martins");
    expect(cleanDisplayName("L")).toBe("L");
    expect(cleanDisplayName("É".repeat(39) + "😀")).toBe("É".repeat(39) + "😀");
  });

  it("refuses empty, only spaces, 41 characters, control and invisible characters", () => {
    for (const bad of ["", "   ", "a".repeat(41), "Lea\u0000", "Le\na", "Lea\u0007", "\u202eaeL", "Le\u200ba", "Lea\u2028M"]) {
      expect(cleanDisplayName(bad)).toBeNull();
    }
  });
});

describe("shownName and initialsOf", () => {
  it("shows the display name, else the part of the address before the @", () => {
    expect(shownName("Lea M.", "lea@example.com")).toBe("Lea M.");
    expect(shownName(null, "lea.martins@example.com")).toBe("lea.martins");
  });

  it("takes up to two initials", () => {
    expect(initialsOf("Lea Martins")).toBe("LM");
    expect(initialsOf("lea.martins")).toBe("LM");
    expect(initialsOf("lea")).toBe("L");
    expect(initialsOf("Ana Sofia Costa")).toBe("AS");
    expect(initialsOf("  ")).toBe("?");
  });
});
