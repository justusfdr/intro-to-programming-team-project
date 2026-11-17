// Tests for the overlap question in the calendar (issue #106): what it says for an event and for a trip,
// and three buttons that look the same (no red, no yellow buttons).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OverlapNotice } from "./OverlapNotice";

const other = { id: "o", title: "Mittagessen", startAt: new Date("2026-11-18T13:15:00Z"), endAt: new Date("2026-11-18T14:15:00Z"), mayOverlap: false };
const render = (kind: "event" | "trip") =>
  renderToStaticMarkup(<OverlapNotice overlap={{ kind, other }} timeZone="UTC" onFine={() => {}} onMove={() => {}} onDiscard={() => {}} />);

describe("the overlap question", () => {
  it("names the other event and its time", () => {
    expect(render("event")).toContain("Overlaps with <strong");
    expect(render("event")).toContain(">Mittagessen</strong>");
    expect(render("trip")).toContain("Your trip here runs into <strong");
  });

  it("has That's fine, Move it and Discard, all three in the same white style", () => {
    const html = render("event");
    const buttons = [...html.matchAll(/<button type="button" class="([^"]+)">([^<]+)<\/button>/g)];
    expect(buttons.map((b) => b[2])).toEqual(["That&#x27;s fine", "Move it", "Discard"]);
    expect(new Set(buttons.map((b) => b[1])).size).toBe(1);
    expect(buttons[0][1]).toContain("bg-surface");
    expect(html).not.toContain("danger");
  });
});
