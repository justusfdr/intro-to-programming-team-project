import { describe, expect, it } from "vitest";
import { sameAddress, wayTo, type WayDefaults } from "./way";

const DEFAULTS: WayDefaults = { travelMode: "transit", travelBufferMinutes: 10, homeAddress: "Rua das Madres 66, Lisboa", homeTravelMode: null, homeTravelBufferMinutes: null };
const GYM = { address: "Avenida 5, Lisboa", travelMode: "walking" as const, bufferMinutes: 5 };

describe("wayTo", () => {
  it("takes Other for an address that is neither home nor a saved place, and for an empty one", () => {
    expect(wayTo("Nova SBE, Carcavelos", DEFAULTS, [GYM])).toEqual({ mode: "transit", bufferMinutes: 10 });
    expect(wayTo("  ", DEFAULTS, [GYM])).toEqual({ mode: "transit", bufferMinutes: 10 });
  });

  it("takes a saved place's own way and buffer, the address written another way too", () => {
    expect(wayTo("avenida 5  lisboa", DEFAULTS, [GYM])).toEqual({ mode: "walking", bufferMinutes: 5 });
  });

  it("takes Other for what a place leaves empty", () => {
    expect(wayTo(GYM.address, DEFAULTS, [{ ...GYM, travelMode: null }])).toEqual({ mode: "transit", bufferMinutes: 5 });
    expect(wayTo(GYM.address, DEFAULTS, [{ ...GYM, bufferMinutes: null }])).toEqual({ mode: "walking", bufferMinutes: 10 });
  });

  it("takes home's own way and buffer for the home address, else Other", () => {
    expect(wayTo(DEFAULTS.homeAddress, DEFAULTS, [])).toEqual({ mode: "transit", bufferMinutes: 10 });
    expect(wayTo(DEFAULTS.homeAddress, { ...DEFAULTS, homeTravelMode: "cycling", homeTravelBufferMinutes: 0 }, [])).toEqual({ mode: "cycling", bufferMinutes: 0 });
  });

  it("never matches an empty home address", () => {
    expect(wayTo("x", { ...DEFAULTS, homeAddress: "", homeTravelMode: "driving" }, [])).toEqual({ mode: "transit", bufferMinutes: 10 });
  });
});

describe("sameAddress", () => {
  it("ignores case, spaces and commas", () => {
    expect(sameAddress("Nova SBE, Carcavelos", "nova sbe  carcavelos")).toBe(true);
    expect(sameAddress("Nova SBE", "Nova")).toBe(false);
  });
});
