// Spec 24, R25: only a message signed with our webhook secret, at most five minutes old, counts.
import { describe, expect, it } from "vitest";
import { signPayload, TOLERANCE_SECONDS, validSignature, verifyEvent } from "./signature";

const SECRET = "whsec_test_signing_secret";
const NOW = new Date("2026-11-16T09:00:00Z");
const EVENT = JSON.stringify({ id: "evt_1", type: "customer.subscription.deleted", livemode: false, data: { object: { id: "sub_1", customer: "cus_A1" } } });

describe("validSignature", () => {
  it("accepts a message signed with our secret now", () => {
    expect(validSignature(EVENT, signPayload(EVENT, SECRET, NOW), SECRET, NOW)).toBe(true);
  });

  it("accepts it when one of several v1 signatures matches (Stripe rolls secrets this way)", () => {
    const good = signPayload(EVENT, SECRET, NOW).split(",")[1];
    const header = `t=${NOW.getTime() / 1000},v1=${"0".repeat(64)},${good}`;
    expect(validSignature(EVENT, header, SECRET, NOW)).toBe(true);
  });

  it("refuses another secret, a changed body, a missing header and a broken header", () => {
    expect(validSignature(EVENT, signPayload(EVENT, "whsec_someone_else", NOW), SECRET, NOW)).toBe(false);
    expect(validSignature(EVENT.replace("cus_A1", "cus_B2"), signPayload(EVENT, SECRET, NOW), SECRET, NOW)).toBe(false);
    expect(validSignature(EVENT, null, SECRET, NOW)).toBe(false);
    for (const header of ["", "t=abc,v1=00", `t=${NOW.getTime() / 1000}`, "v1=00", "nonsense"]) {
      expect(validSignature(EVENT, header, SECRET, NOW), header).toBe(false);
    }
  });

  it("refuses a message older or newer than five minutes, so a recorded one cannot be replayed", () => {
    const signedAt = (seconds: number) => signPayload(EVENT, SECRET, new Date(NOW.getTime() + seconds * 1000));
    expect(validSignature(EVENT, signedAt(-TOLERANCE_SECONDS), SECRET, NOW)).toBe(true);
    expect(validSignature(EVENT, signedAt(-TOLERANCE_SECONDS - 1), SECRET, NOW)).toBe(false);
    expect(validSignature(EVENT, signedAt(TOLERANCE_SECONDS + 1), SECRET, NOW)).toBe(false);
  });

  it("refuses everything when the secret is empty", () => {
    expect(validSignature(EVENT, signPayload(EVENT, "", NOW), "", NOW)).toBe(false);
  });
});

describe("verifyEvent", () => {
  it("returns the event's id, type, mode and object", () => {
    expect(verifyEvent(EVENT, signPayload(EVENT, SECRET, NOW), SECRET, NOW)).toEqual({
      id: "evt_1",
      type: "customer.subscription.deleted",
      livemode: false,
      object: { id: "sub_1", customer: "cus_A1" },
    });
  });

  it("returns null for a signed body that is not an event", () => {
    for (const body of ["not json", "[]", "null", '{"id":"evt_1","type":"x","livemode":false}', '{"id":1,"type":"x","livemode":false,"data":{"object":{}}}']) {
      expect(verifyEvent(body, signPayload(body, SECRET, NOW), SECRET, NOW), body).toBeNull();
    }
  });
});
