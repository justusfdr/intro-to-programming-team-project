// Tests for the map of the way (R27): the address of Google's Embed page. No internet.
import { describe, expect, it } from "vitest";
import { routeMapUrl } from "./map";

const KEY = "browser-key-for-tests";

describe("routeMapUrl", () => {
  it("is Google's directions page from home to the event, with the way of getting there", () => {
    const url = new URL(routeMapUrl("Rua das Madres 66, Lisboa", "Nova SBE, Carcavelos", "transit", KEY)!);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/embed/v1/directions");
    expect(Object.fromEntries(url.searchParams)).toEqual({ key: KEY, origin: "Rua das Madres 66, Lisboa", destination: "Nova SBE, Carcavelos", mode: "transit", language: "en" });
  });

  it("uses Google's names for the ways of getting there", () => {
    const mode = (m: Parameters<typeof routeMapUrl>[2]) => new URL(routeMapUrl("A street 1", "B street 2", m, KEY)!).searchParams.get("mode");
    expect([mode("driving"), mode("cycling"), mode("walking"), mode("transit")]).toEqual(["driving", "bicycling", "walking", "transit"]);
  });

  it("encodes the addresses, so nothing typed can change the address of the page", () => {
    const url = routeMapUrl("Rua A & B 1?x=1#y", "Café São João", "driving", KEY)!;
    expect(url).not.toContain("&x=1");
    expect(url).not.toContain("#y");
    const params = new URL(url).searchParams;
    expect(params.get("origin")).toBe("Rua A & B 1?x=1#y");
    expect(params.get("destination")).toBe("Café São João");
    expect(params.get("key")).toBe(KEY);
  });

  it("trims the addresses", () => {
    expect(new URL(routeMapUrl("  A street 1 ", " B street 2  ", "walking", KEY)!).searchParams.get("origin")).toBe("A street 1");
  });

  it("is null without a key or without an address", () => {
    for (const key of [null, ""]) expect(routeMapUrl("A street 1", "B street 2", "driving", key)).toBeNull();
    expect(routeMapUrl("", "B street 2", "driving", KEY)).toBeNull();
    expect(routeMapUrl("A street 1", "   ", "driving", KEY)).toBeNull();
  });
});
