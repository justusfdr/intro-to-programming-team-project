// Tests for src/lib/events/guests.ts (spec 24): what counts as a guest's address, a whole list (each
// once, at most 20), and the field's text split at commas.
import { describe, expect, it } from "vitest";
import { cleanGuest, cleanGuestList, guestCountText, sameGuests, splitTyped } from "./guests";

describe("a guest's address", () => {
  it("is kept trimmed and lower-case", () => {
    expect(cleanGuest("  Lea.Meier+uni@Example.COM ")).toBe("lea.meier+uni@example.com");
    expect(cleanGuest("tom@uni.example.org")).toBe("tom@uni.example.org");
  });

  it.each(["", "lea", "lea@", "@example.com", "lea@localhost", "Lea <lea@example.com>", "lea @example.com", "lea@example..com", ".lea@example.com", "lea@-example.com"])(
    "refuses %j",
    (raw) => {
      expect(cleanGuest(raw)).toBeNull();
    },
  );

  it("allows 254 characters, not 255", () => {
    expect(cleanGuest(`${"a".repeat(64)}@${"b".repeat(185)}.com`)).not.toBeNull();
    expect(cleanGuest(`${"a".repeat(64)}@${"b".repeat(186)}.com`)).toBeNull();
  });
});

describe("a list", () => {
  it("keeps each address once, in order", () => {
    expect(cleanGuestList(["Lea@example.com", "tom@example.com", "lea@example.com"])).toEqual({ ok: true, guests: ["lea@example.com", "tom@example.com"] });
  });

  it("fails on one entry that is not an address, and on more than 20", () => {
    expect(cleanGuestList(["lea@example.com", "nope"])).toEqual({ ok: false, reason: "invalid" });
    const twenty = Array.from({ length: 20 }, (_, i) => `g${i}@example.com`);
    expect(cleanGuestList(twenty)).toMatchObject({ ok: true });
    expect(cleanGuestList([...twenty, "one@more.example"])).toEqual({ ok: false, reason: "too_many" });
    // The same address twice counts once.
    expect(cleanGuestList([...twenty, "g0@example.com"])).toMatchObject({ ok: true });
  });

  it("compares lists, empty and missing alike", () => {
    expect(sameGuests(undefined, [])).toBe(true);
    expect(sameGuests(["a@example.com"], ["a@example.com"])).toBe(true);
    expect(sameGuests(["a@example.com", "b@example.com"], ["b@example.com", "a@example.com"])).toBe(false);
  });
});

describe("the field", () => {
  it("splits at commas and semicolons; the rest stays in the field", () => {
    expect(splitTyped("lea@example.com, tom@exa")).toEqual({ parts: ["lea@example.com"], rest: " tom@exa" });
    expect(splitTyped("lea@example.com;")).toEqual({ parts: ["lea@example.com"], rest: "" });
    expect(splitTyped("lea@exa")).toEqual({ parts: [], rest: "lea@exa" });
  });

  it("names the count", () => {
    expect(guestCountText(1)).toBe("1 guest");
    expect(guestCountText(2)).toBe("2 guests");
  });
});
