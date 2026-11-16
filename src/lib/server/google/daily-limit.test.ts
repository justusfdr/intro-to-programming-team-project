// Our own daily brake on Google calls.
import { describe, expect, it } from "vitest";
import { createDailyCounter } from "./daily-limit";

describe("createDailyCounter", () => {
  it("allows the limit's number of calls a day, then no more", () => {
    const counter = createDailyCounter(3);
    const at = new Date("2026-11-16T10:00:00Z");
    expect([1, 2, 3, 4, 5].map(() => counter.take(at))).toEqual([true, true, true, false, false]);
  });
  it("starts again at zero on the next day (UTC)", () => {
    const counter = createDailyCounter(1);
    expect(counter.take(new Date("2026-11-16T23:59:59Z"))).toBe(true);
    expect(counter.take(new Date("2026-11-16T23:59:59Z"))).toBe(false);
    expect(counter.take(new Date("2026-11-17T00:00:00Z"))).toBe(true);
  });
  it("allows nothing with a limit of 0", () => {
    expect(createDailyCounter(0).take(new Date())).toBe(false);
  });
});
