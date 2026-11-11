import { describe, expect, it } from "vitest";
import { FakeAuth } from "./fake";
import { isFreshResetSession } from "./reset-window";

const NOW = 1_800_000_000; // seconds

describe("isFreshResetSession (reset_password needs the reset link)", () => {
  it("accepts a recovery entry up to 15 minutes old", () => {
    expect(isFreshResetSession([{ method: "recovery", timestamp: NOW - 15 * 60 }], NOW)).toBe(true);
    expect(isFreshResetSession([{ method: "password", timestamp: NOW - 3600 }, { method: "recovery", timestamp: NOW }], NOW)).toBe(true);
  });

  it("rejects a recovery entry older than 15 minutes", () => {
    expect(isFreshResetSession([{ method: "recovery", timestamp: NOW - 15 * 60 - 1 }], NOW)).toBe(false);
  });

  it("rejects sessions created any other way", () => {
    expect(isFreshResetSession([{ method: "password", timestamp: NOW }], NOW)).toBe(false);
    expect(isFreshResetSession([{ method: "otp", timestamp: NOW }], NOW)).toBe(false);
  });

  it("fails closed on the string format (no timestamp), missing or malformed claims", () => {
    for (const amr of [["recovery"], undefined, null, "recovery", [{ method: "recovery" }], [{ method: "recovery", timestamp: "now" }]]) {
      expect(isFreshResetSession(amr, NOW), JSON.stringify(amr)).toBe(false);
    }
  });

  it("rejects a timestamp far in the future", () => {
    expect(isFreshResetSession([{ method: "recovery", timestamp: NOW + 3600 }], NOW)).toBe(false);
  });
});

describe("FakeAuth.updatePassword follows the same rule", () => {
  async function setUp() {
    let now = Date.parse("2026-11-16T09:00:00Z");
    const auth = new FakeAuth({ now: () => now });
    await auth.addUser("ana@example.com", "old-password", { confirmed: true });
    return { auth, advance: (ms: number) => (now += ms) };
  }

  it("refuses a normal signed-in session; the password stays", async () => {
    const { auth } = await setUp();
    await auth.signIn({ email: "ana@example.com", password: "old-password" });
    expect(await auth.updatePassword("new-password")).toEqual({ kind: "link_expired" });
    expect(await auth.signIn({ email: "ana@example.com", password: "old-password" })).toEqual({ kind: "signed_in" });
  });

  it("lets the reset link's session set a new password within 15 minutes, then ends the session", async () => {
    const { auth, advance } = await setUp();
    await auth.requestPasswordReset("ana@example.com");
    await auth.verifyLink({ tokenHash: auth.lastLink("ana@example.com", "reset")!.tokenHash, kind: "reset" });
    advance(14 * 60 * 1000);
    expect(await auth.updatePassword("new-password")).toEqual({ kind: "ok" });
    expect(auth.session).toBeNull();
    expect(await auth.signIn({ email: "ana@example.com", password: "new-password" })).toEqual({ kind: "signed_in" });
  });

  it("refuses the reset link's session after 15 minutes; the password stays", async () => {
    const { auth, advance } = await setUp();
    await auth.requestPasswordReset("ana@example.com");
    await auth.verifyLink({ tokenHash: auth.lastLink("ana@example.com", "reset")!.tokenHash, kind: "reset" });
    advance(15 * 60 * 1000 + 1000);
    expect(await auth.updatePassword("new-password")).toEqual({ kind: "link_expired" });
    expect(await auth.signIn({ email: "ana@example.com", password: "old-password" })).toEqual({ kind: "signed_in" });
  });
});
