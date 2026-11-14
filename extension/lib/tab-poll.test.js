import { describe, expect, it } from "vitest";
import { shouldPollForTab, TAB_POLL_GAP_MS } from "./answer.js";

const NOW = 1_000_000;
const off = { sites: ["youtube.com"], blockingOn: false, blockingUntil: null };
const on = { sites: ["youtube.com"], blockingOn: true, blockingUntil: NOW + 60_000 };

describe("an extra poll when a tab opens a listed site", () => {
  it("polls for a listed site (and its subdomains) while blocking is off", () => {
    expect(shouldPollForTab(off, "https://www.youtube.com/watch?v=1", NOW, null)).toBe(true);
    expect(shouldPollForTab(off, "https://youtube.com/", NOW, null)).toBe(true);
  });

  it("does not poll for other sites, other schemes, nothing kept, or while blocking is already on", () => {
    expect(shouldPollForTab(off, "https://example.com/", NOW, null)).toBe(false);
    expect(shouldPollForTab(off, "chrome://youtube.com/", NOW, null)).toBe(false);
    expect(shouldPollForTab(off, undefined, NOW, null)).toBe(false);
    expect(shouldPollForTab(null, "https://youtube.com/", NOW, null)).toBe(false);
    expect(shouldPollForTab(on, "https://youtube.com/", NOW, null)).toBe(false);
  });

  it("polls for a listed site once blocking_until has passed", () => {
    expect(shouldPollForTab({ ...on, blockingUntil: NOW - 1 }, "https://youtube.com/", NOW, null)).toBe(true);
  });

  it("polls at most once every 5 seconds", () => {
    expect(shouldPollForTab(off, "https://youtube.com/", NOW, NOW - TAB_POLL_GAP_MS + 1)).toBe(false);
    expect(shouldPollForTab(off, "https://youtube.com/", NOW, NOW - TAB_POLL_GAP_MS)).toBe(true);
  });
});
