// Tests for the encryption box of the stored Outlook access.
import { describe, expect, it } from "vitest";
import { open, seal, tokenPurpose } from "./box";

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 8);

describe("seal and open", () => {
  it("round-trips and never contains the plain value", () => {
    const sealed = seal("refresh-token-123", tokenPurpose("u1"), KEY);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("refresh-token");
    expect(open(sealed, tokenPurpose("u1"), KEY)).toBe("refresh-token-123");
  });

  it("uses a fresh nonce every time", () => {
    const a = seal("same", "p", KEY);
    const b = seal("same", "p", KEY);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
    expect(a).not.toBe(b);
  });

  it("refuses another user's purpose, another key, and any changed byte", () => {
    const sealed = seal("refresh-token-123", tokenPurpose("u1"), KEY);
    expect(open(sealed, tokenPurpose("u2"), KEY)).toBeNull();
    expect(open(sealed, tokenPurpose("u1"), OTHER_KEY)).toBeNull();
    const [v, nonce, body] = sealed.split(".");
    const flipped = body.slice(0, 5) + (body[5] === "A" ? "B" : "A") + body.slice(6);
    expect(open(`${v}.${nonce}.${flipped}`, tokenPurpose("u1"), KEY)).toBeNull();
    expect(open("v2." + sealed.slice(3), tokenPurpose("u1"), KEY)).toBeNull();
    expect(open("garbage", tokenPurpose("u1"), KEY)).toBeNull();
  });

  it("refuses a key shorter than 32 bytes", () => {
    expect(() => seal("x", "p", Buffer.alloc(31))).toThrow(/32 bytes/);
  });
});
