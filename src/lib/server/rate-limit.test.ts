// Tests for the in-memory rate limit shared by search_places and the account actions (Issue #46).
import { describe, expect, it } from "vitest";
import { createLimiter, takeAll } from "./rate-limit";

describe("createLimiter", () => {
  it("allows the limit within the window, refuses one more, and allows again once the window has passed", () => {
    const limiter = createLimiter({ limit: 3, windowMs: 1000 });
    expect([0, 10, 20].map((at) => takeAll([[limiter, "a"]], at))).toEqual([true, true, true]);
    expect(takeAll([[limiter, "a"]], 999)).toBe(false);
    expect(takeAll([[limiter, "b"]], 999)).toBe(true);
    expect(takeAll([[limiter, "a"]], 1000)).toBe(true);
  });

  it("forgets the least recently active keys beyond the size bound", () => {
    const limiter = createLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 });
    limiter.count("a", 0);
    limiter.count("b", 1);
    limiter.count("c", 2);
    // "a" was dropped to keep two keys, so it starts again at zero.
    expect(limiter.allows("a", 3)).toBe(true);
    expect(limiter.allows("c", 3)).toBe(false);
  });
});

describe("takeAll", () => {
  it("counts nothing anywhere when one limiter refuses", () => {
    const email = createLimiter({ limit: 5, windowMs: 1000 });
    const client = createLimiter({ limit: 1, windowMs: 1000 });
    expect(takeAll([[email, "x"], [client, "c"]], 0)).toBe(true);
    for (let i = 0; i < 10; i++) expect(takeAll([[email, "x"], [client, "c"]], 1)).toBe(false);
    // The refused tries did not use up the address's own limit.
    expect(email.allows("x", 2)).toBe(true);
    expect([1, 2, 3, 4].map(() => takeAll([[email, "x"]], 2))).toEqual([true, true, true, true]);
    expect(takeAll([[email, "x"]], 2)).toBe(false);
  });
});
