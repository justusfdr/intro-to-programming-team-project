// The profile page's fields (spec 40): the bio's rule (src/lib/text/shown-text.ts), the order of the checks,
// an empty name only while none is saved, and when the Save button shows (the pattern of spec 17).
import { describe, expect, it } from "vitest";
import { TEXT_EXAMPLES } from "@test/support/text-examples";
import { cleanBio, cleanProfile, profileChanged, type SavedProfileFields } from "./profile-fields";

const NAME = "Name must be 1 to 40 characters, without control characters";
const BIO = "A bio must be 1 to 160 characters on one line, without control characters";
const LINK = "Enter a LinkedIn profile link, like https://www.linkedin.com/in/your-name";

describe("bio", () => {
  it("is null when empty, trimmed otherwise, at most 160 characters, one line", () => {
    expect(cleanBio("")).toBeNull();
    expect(cleanBio("   ")).toBeNull();
    expect(cleanBio("  Statistics at Nova 📊 ")).toBe("Statistics at Nova 📊");
    expect(cleanBio("a".repeat(160))).toBe("a".repeat(160));
    expect(cleanBio("😀".repeat(160))).toBe("😀".repeat(160));
    for (const bad of ["a".repeat(161), "one\ntwo", "one\r\ntwo", "one two", "a​b", "‮ab"]) expect(cleanBio(bad)).toBe("refused");
  });

  it("follows the table of examples in test/support (the same rule as the database)", () => {
    for (const example of TEXT_EXAMPLES) expect(cleanBio(example.text) !== "refused", example.what).toBe(example.title);
  });
});

describe("the three fields together", () => {
  it("cleans all three", () => {
    expect(cleanProfile({ displayName: " Lea ", bio: " Hi ", linkedin: "linkedin.com/in/lea-m/" }, null)).toEqual({
      ok: true,
      displayName: "Lea",
      bio: "Hi",
      linkedinUrl: "https://www.linkedin.com/in/lea-m",
    });
    expect(cleanProfile({ displayName: "", bio: "", linkedin: "" }, null)).toEqual({ ok: true, displayName: null, bio: null, linkedinUrl: null });
  });

  it("names the first wrong field in the order of the form", () => {
    expect(cleanProfile({ displayName: "", bio: "", linkedin: "" }, "Lea")).toEqual({ ok: false, field: "displayName", message: NAME });
    expect(cleanProfile({ displayName: "a".repeat(41), bio: "\n\n x", linkedin: "javascript:alert(1)" }, null)).toEqual({ ok: false, field: "displayName", message: NAME });
    expect(cleanProfile({ displayName: "Lea", bio: "a\nb", linkedin: "javascript:alert(1)" }, null)).toEqual({ ok: false, field: "bio", message: BIO });
    expect(cleanProfile({ displayName: "Lea", bio: "Hi", linkedin: "javascript:alert(1)" }, null)).toEqual({ ok: false, field: "linkedin", message: LINK });
  });
});

describe("whether something changed", () => {
  const saved: SavedProfileFields = { displayName: "Lea", bio: null, linkedinUrl: "https://www.linkedin.com/in/lea-m" };
  const same = { displayName: "Lea", bio: "", linkedin: "https://www.linkedin.com/in/lea-m" };

  it("is false for the saved values, also with spaces around them", () => {
    expect(profileChanged(saved, same)).toBe(false);
    expect(profileChanged(saved, { displayName: " Lea ", bio: "  ", linkedin: " https://www.linkedin.com/in/lea-m" })).toBe(false);
  });

  it("is true as soon as one field differs, and false again when it is taken back", () => {
    expect(profileChanged(saved, { ...same, displayName: "Lea M" })).toBe(true);
    expect(profileChanged(saved, { ...same, bio: "Hi" })).toBe(true);
    expect(profileChanged(saved, { ...same, linkedin: "" })).toBe(true);
    expect(profileChanged(saved, { ...same, bio: "" })).toBe(false);
  });
});
