// This week's circles under a goal's rule (R9): one per session or per hour, filled for what is done.
import { describe, expect, it } from "vitest";
import { MAX_CIRCLES, ruleCircles } from "./share";

describe("rule circles", () => {
  it("has one circle per session of a count rule, the done ones full", () => {
    expect(ruleCircles({ text: "This week: 2 of 6 done", status: "open" })).toEqual([1, 1, 0, 0, 0, 0]);
  });

  it("has one circle per hour of an hours rule, a part of an hour filling its circle partly", () => {
    expect(ruleCircles({ text: "This week: 1.5 of 6 h", status: "open" })).toEqual([1, 0.5, 0, 0, 0, 0]);
  });

  it("lets half an hour fill the last circle of a target like 3.5 h", () => {
    expect(ruleCircles({ text: "This week: 3.5 of 3.5 h", status: "met" })).toEqual([1, 1, 1, 1]);
    expect(ruleCircles({ text: "This week: 3.2 of 3.5 h", status: "open" })?.[3]).toBeCloseTo(0.4);
  });

  it("is all full when the rule is met, also when more than the target is done", () => {
    expect(ruleCircles({ text: "This week: 3 of 2 done", status: "met" })).toEqual([1, 1]);
  });

  it("is all empty at the start of the week", () => {
    expect(ruleCircles({ text: "This week: 0 of 3 done", status: "open" })).toEqual([0, 0, 0]);
  });

  it("draws nothing above the most circles, or without a target", () => {
    expect(ruleCircles({ text: `This week: 2 of ${MAX_CIRCLES} done`, status: "open" })).toHaveLength(MAX_CIRCLES);
    expect(ruleCircles({ text: `This week: 2 of ${MAX_CIRCLES + 1} done`, status: "open" })).toBeNull();
    expect(ruleCircles({ text: "This week: 0 of 0 done", status: "open" })).toBeNull();
    expect(ruleCircles({ text: "Something else", status: "open" })).toBeNull();
  });
});
