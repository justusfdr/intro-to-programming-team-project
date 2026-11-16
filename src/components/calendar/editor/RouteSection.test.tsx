// ROUTE in the event editor: From, the way of getting there and To, in the order of the trip.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SavedPlacesProvider } from "@/components/places/SavedPlaces";
import type { TravelMode } from "@/lib/settings/types";
import { RouteSection, fromView, toView } from "./RouteSection";

const UNI = { id: "0b1e2c3d-1111-4222-8333-944455556666", name: "Uni", address: "Campus 1, Lisboa" };
const HOME = "Rua das Madres 66, Lisboa";

const render = (props: { from?: string | null; mode?: TravelMode | null; location?: string } = {}) =>
  renderToStaticMarkup(
    <SavedPlacesProvider places={[UNI]} home={HOME} travelMode="driving">
      <RouteSection from={props.from ?? null} onFrom={() => {}} mode={props.mode ?? null} onMode={() => {}} location={props.location ?? ""} onLocation={() => {}} />
    </SavedPlacesProvider>,
  );

describe("what From and To show", () => {
  it("From: Last event when nothing is chosen or the place was deleted; Home, a place or an address otherwise", () => {
    expect(fromView(null, HOME, [UNI])).toEqual({ kind: "last", title: "Last event" });
    expect(fromView({ kind: "last" }, HOME, [UNI]).title).toBe("Last event");
    expect(fromView({ kind: "place", id: UNI.id }, HOME, [])).toEqual({ kind: "last", title: "Last event" });
    expect(fromView({ kind: "home" }, HOME, [UNI])).toEqual({ kind: "home", title: "Home", detail: HOME });
    expect(fromView({ kind: "place", id: UNI.id }, HOME, [UNI])).toEqual({ kind: "place", title: "Uni", detail: UNI.address });
    expect(fromView({ kind: "address", address: "Rua 1" }, HOME, [UNI])).toEqual({ kind: "address", title: "Rua 1" });
  });

  it("To: Home or a place by name when the location is its address, else the text", () => {
    expect(toView("", HOME, [UNI]).title).toBe("Add destination");
    expect(toView(HOME, HOME, [UNI])).toEqual({ kind: "home", title: "Home", detail: HOME });
    expect(toView("Campus 1, Lisboa", HOME, [UNI])).toEqual({ kind: "place", title: "Uni", detail: UNI.address });
    expect(toView("Room 2.14", HOME, [UNI])).toEqual({ kind: "address", title: "Room 2.14" });
  });
});

describe("the route", () => {
  it("is From, then the way, then To, under the heading Route; no Standard switch and no Automatic", () => {
    const html = render();
    const at = (part: string) => html.indexOf(part);
    expect(at(">Route</p>")).toBeGreaterThan(-1);
    expect(at('aria-label="From: Last event"')).toBeGreaterThan(at(">Route</p>"));
    expect(at(">Driving</span>")).toBeGreaterThan(at('aria-label="From: Last event"'));
    expect(at('aria-label="To: Add destination"')).toBeGreaterThan(at(">Driving</span>"));
    expect(html).toContain("(default)");
    expect(html).not.toContain("Automatic");
    expect(html).not.toContain('role="switch"');
  });

  it("shows the event's own way without (default), and the saved place's name in To", () => {
    const html = render({ mode: "transit", location: "Campus 1, Lisboa", from: "home" });
    expect(html).toContain(">Public transport</span>");
    expect(html).not.toContain("(default)");
    expect(html).toContain('aria-label="To: Uni"');
    expect(html).toContain('aria-label="From: Home"');
  });

  it("offers Save as place under a typed address, not under a saved one", () => {
    expect(render({ location: "Rua Augusta 1" })).toContain(">Save as place</button>");
    expect(render({ location: "Campus 1, Lisboa" })).not.toContain("Save as place");
  });
});
