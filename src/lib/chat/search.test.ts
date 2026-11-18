// Spec 44: the pure parts of searching chats: the words, the database patterns, the excerpt, the marks.
import { describe, expect, it } from "vitest";
import { excerptOf, hitParts, likePatterns, SEARCH_MAX_WORDS, searchWords } from "./search";

describe("searchWords", () => {
  it("splits at white space, keeps each word once ignoring case", () => {
    expect(searchWords("  gym   Friday gym GYM ")).toEqual(["gym", "Friday"]);
  });

  it("has no words for an empty search, and is null over 100 characters", () => {
    expect(searchWords("   ")).toEqual([]);
    expect(searchWords("x".repeat(100))).toEqual(["x".repeat(100)]);
    expect(searchWords("x".repeat(101))).toBeNull();
  });

  it("counts at most 8 words", () => {
    expect(searchWords("a b c d e f g h i j")).toHaveLength(SEARCH_MAX_WORDS);
  });
});

describe("likePatterns", () => {
  it("matches each word anywhere and searches %, _ and \\ as typed", () => {
    expect(likePatterns(["gym", "50%", "a_b", "c\\d"])).toEqual(["%gym%", "%50\\%%", "%a\\_b%", "%c\\\\d%"]);
  });
});

describe("excerptOf", () => {
  const long = `${"Monday was busy with lectures and errands all day long. ".repeat(3)}Then I want to go to the gym on Friday evening after work. ${"More words follow here. ".repeat(10)}`;

  it("shows the text around the first hit on one line, with … where text was left out", () => {
    const excerpt = excerptOf(long, ["gym"]);
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).toContain("go to the gym on Friday evening");
    expect(excerpt.length).toBeLessThan(150);
  });

  it("keeps a short message whole and finds the hit ignoring case", () => {
    expect(excerptOf("Plan the\nGYM tomorrow", ["gym"])).toBe("Plan the GYM tomorrow");
  });
});

describe("hitParts", () => {
  it("cuts the text into hits and the rest, ignoring case", () => {
    expect(hitParts("Gym on Friday, gym again", ["gym", "friday"])).toEqual([
      { text: "Gym", hit: true },
      { text: " on ", hit: false },
      { text: "Friday", hit: true },
      { text: ", ", hit: false },
      { text: "gym", hit: true },
      { text: " again", hit: false },
    ]);
  });

  it("treats the words as plain text, not as patterns", () => {
    expect(hitParts("a.b and axb", ["a.b"])).toEqual([
      { text: "a.b", hit: true },
      { text: " and axb", hit: false },
    ]);
  });
});
