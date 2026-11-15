// The pure parts of spec 33's cards: the shown name, the bio line, the local time with the city, and
// the marks of what a person shares.
import { describe, expect, it } from "vitest";
import { bioLine, cityOf, localTimeLabel, shareMarks, shownName } from "./present";

describe("shown name", () => {
  it("is the display name, else the part of the address before the @", () => {
    expect(shownName("Emily Lea", "emily@example.com")).toBe("Emily Lea");
    expect(shownName(null, "emily.lea@example.com")).toBe("emily.lea");
  });
});

describe("bio line", () => {
  it("is the first line, trimmed, or null", () => {
    expect(bioLine("Statistics at Nova")).toBe("Statistics at Nova");
    expect(bioLine("  First line  \nsecond")).toBe("First line");
    expect(bioLine(null)).toBeNull();
    expect(bioLine("   ")).toBeNull();
  });

  it("is cut with an ellipsis when too long, counting characters (emoji too)", () => {
    expect(bioLine("abcdefghij", 5)).toBe("abcd…");
    expect(bioLine("abcde", 5)).toBe("abcde");
    expect(bioLine("📊📊📊📊📊📊", 4)).toBe("📊📊📊…");
    expect(bioLine("abc defgh", 5)).toBe("abc…");
  });
});

describe("local time with the city", () => {
  // 14:20 in Lisbon (winter: UTC), 15:20 in Berlin, 9:20 in New York.
  const at = new Date("2026-11-17T14:20:00Z");

  it("names the city of the time zone", () => {
    expect(cityOf("Europe/Berlin")).toBe("Berlin");
    expect(cityOf("America/New_York")).toBe("New York");
    expect(cityOf("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(cityOf("UTC")).toBe("UTC");
  });

  it("gives the time there in the viewer's format", () => {
    expect(localTimeLabel(at, "Europe/Berlin", "24h")).toBe("15:20 · Berlin");
    expect(localTimeLabel(at, "Europe/Lisbon", "24h")).toBe("14:20 · Lisbon");
    expect(localTimeLabel(at, "America/New_York", "12h")).toBe("9:20am · New York");
  });

  it("follows a clock change", () => {
    // Berlin is two hours ahead in summer.
    expect(localTimeLabel(new Date("2026-07-01T12:00:00Z"), "Europe/Berlin", "24h")).toBe("14:00 · Berlin");
  });

  it("is null for a time zone the runtime does not know", () => {
    expect(localTimeLabel(at, "Mars/Olympus", "24h")).toBeNull();
  });
});

describe("what they share", () => {
  it("one mark per thing, calendar first", () => {
    expect(shareMarks({ calendar: "details", focus: true }).map((m) => m.kind)).toEqual(["calendar-details", "focus"]);
    expect(shareMarks({ calendar: "busy", focus: false })).toEqual([{ kind: "calendar-busy", label: "Shares their calendar as free/busy" }]);
    expect(shareMarks({ calendar: "none", focus: true })).toEqual([{ kind: "focus", label: "Shares their focus chart" }]);
  });

  it("nothing when they share nothing or it is unknown", () => {
    expect(shareMarks({ calendar: "none", focus: false })).toEqual([]);
    expect(shareMarks(null)).toEqual([]);
  });
});
