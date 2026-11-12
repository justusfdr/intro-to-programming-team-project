// The number behind the thin bar under a goal (spec 10): each rule's share of its target, averaged.
import { describe, expect, it } from "vitest";
import { ruleShare, weekShare } from "./share";

describe("rule share", () => {
  it("reads the share from the rule's words", () => {
    expect(ruleShare({ text: "This week: 1 of 2 done", status: "open" })).toBe(0.5);
    expect(ruleShare({ text: "This week: 3.5 of 6 h", status: "open" })).toBeCloseTo(3.5 / 6);
    expect(ruleShare({ text: "This week: 0 of 3 done", status: "open" })).toBe(0);
  });

  it("is full for a met rule and never above full", () => {
    expect(ruleShare({ text: "This week: 2 of 2 done", status: "met" })).toBe(1);
    expect(ruleShare({ text: "This week: 7.5 of 6 h", status: "met" })).toBe(1);
    expect(ruleShare({ text: "This week: 3 of 2 done", status: "open" })).toBe(1);
  });

  it("is 0 for words it cannot read", () => {
    expect(ruleShare({ text: "Something else", status: "open" })).toBe(0);
    expect(ruleShare({ text: "This week: 1 of 0 done", status: "open" })).toBe(0);
  });
});

describe("week share", () => {
  it("averages the rules", () => {
    expect(
      weekShare([
        { text: "This week: 2 of 2 done", status: "met" },
        { text: "This week: 3 of 6 h", status: "open" },
      ]),
    ).toBe(0.75);
  });

  it("is 0 without rules", () => {
    expect(weekShare([])).toBe(0);
  });
});
