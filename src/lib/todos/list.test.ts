// The editor's list steps (spec 21): moving a to-do, cleaning a title, the limit of 20, the count.
import { describe, expect, it } from "vitest";
import { cleanTitle, countOf, hasRoom, moveTo } from "./list";
import { todoCountText } from "./types";

const list = ["a", "b", "c"].map((key) => ({ key, title: key, done: key === "b" }));
const keys = (l: { key: string }[]) => l.map((t) => t.key);

describe("moveTo", () => {
  it("moves up, down, to the top and to the end; the others close up", () => {
    expect(keys(moveTo(list, "c", 0))).toEqual(["c", "a", "b"]);
    expect(keys(moveTo(list, "a", 1))).toEqual(["b", "a", "c"]);
    expect(keys(moveTo(list, "a", 2))).toEqual(["b", "c", "a"]);
    expect(keys(moveTo(list, "b", 99))).toEqual(["a", "c", "b"]);
    expect(keys(moveTo(list, "b", -1))).toEqual(["b", "a", "c"]);
  });

  it("an unknown key changes nothing", () => {
    expect(keys(moveTo(list, "x", 0))).toEqual(["a", "b", "c"]);
  });
});

describe("cleanTitle, hasRoom, countOf", () => {
  it("trims; refuses empty and over 100 characters", () => {
    expect(cleanTitle("  Read  ")).toBe("Read");
    expect(cleanTitle("   ")).toBeNull();
    expect(cleanTitle("x".repeat(100))).toBe("x".repeat(100));
    expect(cleanTitle("x".repeat(101))).toBeNull();
  });

  it("room for one more up to 20", () => {
    expect(hasRoom(Array.from({ length: 19 }))).toBe(true);
    expect(hasRoom(Array.from({ length: 20 }))).toBe(false);
  });

  it("counts the done ones: '1/3'", () => {
    const { done, total } = countOf(list);
    expect(todoCountText(done, total)).toBe("1/3");
  });
});
