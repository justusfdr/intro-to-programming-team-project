// The editor asks for the travel line with the route as it is on screen, before Save.
import { describe, expect, it } from "vitest";
import { travelUrl } from "./TravelLine";

describe("travelUrl", () => {
  it("asks with the saved route when the editor cannot change it (Outlook)", () => {
    expect(travelUrl("abc")).toBe("/api/events/abc/travel");
  });

  it("sends the route as it is on screen; the standard way and start are empty", () => {
    const url = new URL(travelUrl("abc", { location: "Nova SBE", mode: null, from: "address:Cais do Sodré" }), "http://x");
    expect(url.pathname).toBe("/api/events/abc/travel");
    expect(Object.fromEntries(url.searchParams)).toEqual({ location: "Nova SBE", mode: "", from: "address:Cais do Sodré" });
  });
});
