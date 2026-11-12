import { describe, expect, it } from "vitest";
import { buildRules, isBlockedHost, nextKept, readAnswer, sitesToBlock } from "./answer.js";

const NOW = Date.parse("2026-11-16T10:15:00Z");
const ON = { sites: ["instagram.com", "x.com"], blockingOn: true, blockingUntil: "2026-11-16T11:00:00.000Z" };
const KEPT_ON = { sites: ["instagram.com", "x.com"], blockingOn: true, blockingUntil: Date.parse("2026-11-16T11:00:00Z") };

describe("reading the app's answer", () => {
  it("keeps exactly the list, blocking_on and blocking_until", () => {
    expect(readAnswer(ON)).toEqual(KEPT_ON);
    expect(readAnswer({ sites: [], blockingOn: false, blockingUntil: null })).toEqual({ sites: [], blockingOn: false, blockingUntil: null });
  });

  it.each([
    ["no object", null],
    ["a bad domain", { ...ON, sites: ["https://instagram.com"] }],
    ["51 sites", { ...ON, sites: Array.from({ length: 51 }, (_, i) => `s${i}.com`) }],
    ["blocking on without an end", { ...ON, blockingUntil: null }],
    ["an end that is not a time", { ...ON, blockingUntil: "soon" }],
    ["blocking_on not a boolean", { ...ON, blockingOn: "yes" }],
  ])("refuses %s (then nothing is blocked)", (_case, body) => {
    expect(readAnswer(body)).toBeNull();
  });
});

describe("what the extension keeps (R16, fail closed)", () => {
  it("takes a valid answer", () => {
    expect(nextKept(null, { kind: "answer", body: ON }, NOW)).toEqual(KEPT_ON);
  });

  it("drops everything at once when refused (401, 403) or the answer is broken", () => {
    expect(nextKept(KEPT_ON, { kind: "refused" }, NOW)).toBeNull();
    expect(nextKept(KEPT_ON, { kind: "answer", body: "<html>" }, NOW)).toBeNull();
  });

  it("keeps the last answer while the app is unreachable, until blocking_until, then drops it", () => {
    expect(nextKept(KEPT_ON, { kind: "unreachable" }, NOW)).toEqual(KEPT_ON);
    expect(nextKept(KEPT_ON, { kind: "unreachable" }, Date.parse("2026-11-16T11:00:00Z"))).toBeNull();
    expect(nextKept(null, { kind: "unreachable" }, NOW)).toBeNull();
  });
});

describe("which sites to block now", () => {
  it("blocks the list only while on and before blocking_until", () => {
    expect(sitesToBlock(KEPT_ON, NOW)).toEqual(["instagram.com", "x.com"]);
    expect(sitesToBlock(KEPT_ON, Date.parse("2026-11-16T11:00:00Z"))).toEqual([]);
    expect(sitesToBlock({ ...KEPT_ON, blockingOn: false }, NOW)).toEqual([]);
    expect(sitesToBlock(null, NOW)).toEqual([]);
  });

  it("matches a site and its subdomains, not look-alikes", () => {
    expect(isBlockedHost("instagram.com", KEPT_ON.sites)).toBe(true);
    expect(isBlockedHost("www.instagram.com", KEPT_ON.sites)).toBe(true);
    expect(isBlockedHost("notinstagram.com", KEPT_ON.sites)).toBe(false);
    expect(isBlockedHost("instagram.com.evil.io", KEPT_ON.sites)).toBe(false);
  });

  it("builds one main-frame redirect rule per site, carrying the nonce", () => {
    expect(buildRules(["x.com"], "n-1")).toEqual([
      {
        id: 1,
        priority: 1,
        action: { type: "redirect", redirect: { extensionPath: "/blocked.html?site=x.com&via=load&n=n-1" } },
        condition: { requestDomains: ["x.com"], resourceTypes: ["main_frame"] },
      },
    ]);
    expect(buildRules([], "n-1")).toEqual([]);
  });
});
