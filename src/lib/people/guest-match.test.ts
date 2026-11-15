// Guests shown as people (spec 35): only the user's own contacts, only for addresses on the events.
import { describe, expect, it } from "vitest";
import { guestAddresses, matchGuests, type MatchableContact } from "./guest-match";

const LEA: MatchableContact = { userId: "u-lea", name: "Lea Sousa", photoUrl: "/api/profiles/u-lea/photo?v=1", email: "Lea@Example.com" };
const BEN: MatchableContact = { userId: "u-ben", name: "ben", photoUrl: null, email: "ben@example.com" };

describe("guestAddresses", () => {
  it("collects guests and organizers in lower case, each once, without empty ones", () => {
    const addresses = guestAddresses([
      { guests: ["lea@example.com", "stranger@example.com"] },
      { guests: ["LEA@example.com "], organizer: "Boss@Example.com" },
      {},
      { organizer: "" },
    ]);
    expect([...addresses].sort()).toEqual(["boss@example.com", "lea@example.com", "stranger@example.com"]);
  });
});

describe("matchGuests", () => {
  it("gives a contact whose address is a guest, with id, name and photo only", () => {
    const found = matchGuests(new Set(["lea@example.com", "stranger@example.com"]), [LEA, BEN]);
    expect(found).toEqual({ "lea@example.com": { userId: "u-lea", name: "Lea Sousa", photoUrl: "/api/profiles/u-lea/photo?v=1" } });
    expect(Object.keys(found["lea@example.com"]).sort()).toEqual(["name", "photoUrl", "userId"]);
  });

  it("gives nothing for a stranger, and nothing for a contact who is no guest", () => {
    expect(matchGuests(new Set(["stranger@example.com"]), [LEA, BEN])).toEqual({});
    expect(matchGuests(new Set(), [LEA, BEN])).toEqual({});
    expect(matchGuests(new Set(["lea@example.com"]), [])).toEqual({});
  });

  it("is not fooled by an address that looks like an object's own key", () => {
    expect(matchGuests(new Set(["__proto__", "constructor"]), [LEA])).toEqual({});
  });
});
