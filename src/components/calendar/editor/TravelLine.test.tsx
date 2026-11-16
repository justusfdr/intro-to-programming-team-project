// The travel line under an event's location (R27, scenario A9): "Leave at …" with the trip and the buffer,
// or the ontology's message. The OpenStreetMap credit is in the settings, not on every line.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TravelAnswer } from "@/lib/travel/types";
import { TravelLineView, travelText } from "./TravelLine";

const A9: TravelAnswer = { status: "ok", mode: "driving", minutes: 25, bufferMinutes: 10, leaveAt: "2026-11-17T09:25:00.000Z" };
const view = (travel: Parameters<typeof TravelLineView>[0]["travel"], unsaved = false, timeFormat: "12h" | "24h" = "12h") =>
  renderToStaticMarkup(<TravelLineView travel={travel} timeZone="Europe/Lisbon" timeFormat={timeFormat} unsaved={unsaved} />);

describe("travelText", () => {
  it("A9: Leave at 9:25am, 25m by car + 10m buffer, in the user's time format", () => {
    expect(travelText(A9, "Europe/Lisbon", "12h")).toEqual({ main: "Leave at 9:25am", detail: "25m by car + 10m buffer" });
    expect(travelText({ ...A9, from: "Uni" }, "Europe/Lisbon", "12h").detail).toBe("25m by car from Uni + 10m buffer");
    expect(travelText(A9, "Europe/Lisbon", "24h").main).toBe("Leave at 9:25");
  });

  it("names the way of getting there and leaves out a buffer of 0", () => {
    expect(travelText({ ...A9, mode: "transit", minutes: 42, bufferMinutes: 0 }, "Europe/Lisbon", "12h").detail).toBe("42m by public transport");
    expect(travelText({ ...A9, mode: "walking", minutes: 241 }, "Europe/Lisbon", "12h").detail).toBe("4h 1m on foot + 10m buffer");
    expect(travelText({ ...A9, mode: "cycling" }, "Europe/Lisbon", "12h").detail).toContain("by bike");
  });

  it("shows the time in the user's time zone", () => {
    expect(travelText(A9, "Europe/Berlin", "24h").main).toBe("Leave at 10:25");
  });

  it("shows the ontology's message otherwise", () => {
    expect(travelText({ status: "unavailable", mode: "driving", message: "Travel time not available" }, "Europe/Lisbon", "12h")).toEqual({ main: "Travel time not available", detail: null });
  });
});

describe("the line", () => {
  it("shows the time to leave, without the credit (it is in the settings)", () => {
    const html = view(A9);
    expect(html).toContain("Leave at 9:25am");
    expect(html).toContain("25m by car + 10m buffer");
    expect(html).not.toContain("OpenStreetMap");
  });

  it("links to the settings when there is no home address", () => {
    const html = view({ status: "no_home", mode: "driving", message: "Add your home address in settings" });
    expect(html).toContain("Add your home address in settings");
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain("OpenStreetMap");
  });

  it("says when it is still working, when it failed, and that unsaved changes count only after Save", () => {
    expect(view("loading")).toContain("Working out the travel time…");
    expect(view("failed")).toContain("Travel time not available");
    expect(view(A9, true)).toContain("Save to update the travel time.");
    expect(view(A9, false)).not.toContain("Save to update");
  });

  it("shows nothing when the event has no travel time (no location, web link, all-day)", () => {
    expect(view(null)).toBe("");
  });
});

describe("the map of the way", () => {
  const MAP = "https://www.google.com/maps/embed/v1/directions?key=k&origin=A&destination=B&mode=driving&language=en";

  it("offers \"Show map\" when the answer has a map, and loads nothing from Google before it is opened", () => {
    const html = view({ ...A9, map: MAP });
    expect(html).toContain("Show map");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("google.com");
  });

  it("offers no map without one, and none for a message", () => {
    expect(view(A9)).not.toContain("Show map");
    expect(view({ status: "unavailable", mode: "driving", message: "Travel time not available" })).not.toContain("Show map");
    expect(view("loading")).not.toContain("Show map");
  });
});
