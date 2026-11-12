import { describe, expect, it } from "vitest";
import { addAttempt, dropOld, isRealAttempt } from "./attempts.js";

const NOW = Date.parse("2026-11-16T10:15:00Z");

describe("attempts waiting to be sent", () => {
  it("adds an attempt with its time", () => {
    expect(addAttempt([], "instagram.com", NOW)).toEqual([{ domain: "instagram.com", attemptedAt: "2026-11-16T10:15:00.000Z" }]);
  });

  it("counts a page that reloads itself within 5 seconds once", () => {
    const once = addAttempt([], "instagram.com", NOW);
    expect(addAttempt(once, "instagram.com", NOW + 4000)).toHaveLength(1);
    expect(addAttempt(once, "instagram.com", NOW + 6000)).toHaveLength(2);
    expect(addAttempt(once, "x.com", NOW + 1000)).toHaveLength(2);
  });

  it("drops attempts older than 48 hours and keeps at most 200", () => {
    expect(dropOld([{ domain: "x.com", attemptedAt: "2026-11-14T10:14:00Z" }], NOW)).toEqual([]);
    let queue = [];
    for (let i = 0; i < 250; i++) queue = addAttempt(queue, `s${i}.com`, NOW + i * 10);
    expect(queue).toHaveLength(200);
    expect(queue[0].domain).toBe("s50.com");
  });
});

describe("which block page visits are real attempts (forged-attempt defence)", () => {
  const sites = ["instagram.com"];
  it("counts a visit through the extension's own redirect: right nonce, listed site", () => {
    expect(isRealAttempt({ via: "load", n: "secret", site: "instagram.com" }, "secret", sites)).toBe(true);
  });

  it.each([
    ["a tab the extension moved itself", { via: "open", site: "instagram.com" }],
    ["no nonce (an address someone made up)", { via: "load", site: "instagram.com" }],
    ["a wrong nonce", { via: "load", n: "guess", site: "instagram.com" }],
    ["a site not on the list", { via: "load", n: "secret", site: "x.com" }],
    ["no message", null],
  ])("does not count %s", (_case, message) => {
    expect(isRealAttempt(message, "secret", sites)).toBe(false);
  });

  it("counts nothing while blocking is off (no sites)", () => {
    expect(isRealAttempt({ via: "load", n: "secret", site: "instagram.com" }, "secret", [])).toBe(false);
  });
});
