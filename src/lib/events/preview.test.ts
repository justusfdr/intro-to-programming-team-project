// The small card's pure parts (spec 35, kept by spec 38 for the read-only card of other people's events):
// the date-and-time line and the place.
import { describe, expect, it } from "vitest";
import { placeOf, whenSentence } from "./preview";

describe("whenSentence", () => {
  it("a timed event on one day, in 24-hour and 12-hour form", () => {
    const when = { allDay: false as const, startLocal: "2026-11-14T14:30", endLocal: "2026-11-14T15:45" };
    expect(whenSentence(when, "24h")).toBe("Sat, Nov 14 · 14:30 to 15:45");
    expect(whenSentence(when, "12h")).toBe("Sat, Nov 14 · 2:30pm to 3:45pm");
  });

  it("a timed event past midnight names both days", () => {
    expect(whenSentence({ allDay: false, startLocal: "2026-11-14T23:00", endLocal: "2026-11-15T01:30" }, "24h")).toBe("Sat, Nov 14 · 23:00 to Sun, Nov 15 · 1:30");
    expect(whenSentence({ allDay: false, startLocal: "2026-11-14T23:00", endLocal: "2026-11-15T00:00" }, "12h")).toBe("Sat, Nov 14 · 11pm to Sun, Nov 15 · 12am");
  });

  it("all day on one day and over several days", () => {
    expect(whenSentence({ allDay: true, firstDay: "2026-11-14", lastDay: "2026-11-14" }, "24h")).toBe("Sat, Nov 14 · all day");
    expect(whenSentence({ allDay: true, firstDay: "2026-11-14", lastDay: "2026-11-16" }, "12h")).toBe("Sat, Nov 14 to Mon, Nov 16 · all day");
    expect(whenSentence({ allDay: true, firstDay: "2026-12-30", lastDay: "2027-01-02" }, "24h")).toBe("Wed, Dec 30 to Sat, Jan 2 · all day");
  });
});

describe("placeOf", () => {
  it("nothing for an empty place", () => {
    expect(placeOf(null)).toEqual({ kind: "none" });
    expect(placeOf("   ")).toEqual({ kind: "none" });
  });

  it("an address as text", () => {
    expect(placeOf(" Nova SBE, Carcavelos ")).toEqual({ kind: "address", text: "Nova SBE, Carcavelos" });
    expect(placeOf("Room 2.01")).toEqual({ kind: "address", text: "Room 2.01" });
  });

  it("a link only for a whole https address without a user name", () => {
    expect(placeOf("https://teams.microsoft.com/l/meetup")).toEqual({ kind: "link", href: "https://teams.microsoft.com/l/meetup", text: "https://teams.microsoft.com/l/meetup" });
  });

  it("text only (no link) for any other web address", () => {
    for (const text of ["http://zoom.us/j/1", "www.zoom.us/j/123", "javascript://x%0Aalert(1)", "Join: https://meet.google.com/abc", "https://user:pw@example.com"]) {
      expect(placeOf(text), text).toEqual({ kind: "text", text });
    }
  });
});
