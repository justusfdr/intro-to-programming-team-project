import { describe, expect, it } from "vitest";
import { msToNextMinute } from "./next-minute";

describe("msToNextMinute", () => {
  const at = (iso: string) => Date.parse(iso);

  it("waits for the rest of the minute, not a whole one", () => {
    expect(msToNextMinute(at("2026-11-14T15:01:50.000Z"))).toBe(10_000);
    expect(msToNextMinute(at("2026-11-14T15:01:59.999Z"))).toBe(1);
  });

  it("waits a full minute exactly on the minute", () => {
    expect(msToNextMinute(at("2026-11-14T15:02:00.000Z"))).toBe(60_000);
  });
});
