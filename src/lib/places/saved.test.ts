import { describe, expect, it } from "vitest";
import { travelFromOf, travelFromText } from "./saved";

const ID = "0b1e2c3d-1111-4222-8333-944455556666";

describe("travel_from as text", () => {
  it("goes there and back for every choice", () => {
    for (const from of [{ kind: "home" }, { kind: "last" }, { kind: "place", id: ID }, { kind: "address", address: "Rua Augusta 1" }] as const) {
      expect(travelFromOf(travelFromText(from))).toEqual(from);
    }
    expect(travelFromText(null)).toBeNull();
  });

  it("refuses a bad place id or an empty address, and reads unknown text as the standard", () => {
    expect(travelFromText({ kind: "place", id: "nope" })).toBeNull();
    expect(travelFromText({ kind: "address", address: "  " })).toBeNull();
    for (const text of [null, "", "work", "place:nope", "address:"]) expect(travelFromOf(text)).toBeNull();
  });
});
