// The Places row in the Travel card and its list: Home on top, then the saved places, each to change or
// delete, and "Add place" until there are 10.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlacesList, PlacesRow, placesHint } from "./PlacesDialog";

const PLACES = [
  { id: "0b1e2c3d-1111-4222-8333-944455556666", name: "Uni", address: "Campus 1, Lisboa" },
  { id: "0b1e2c3d-1111-4222-8333-944455556667", name: "Gym", address: "Rua 2, Lisboa" },
];

describe("the Places row", () => {
  it("names the saved places (not Home) and offers Manage", () => {
    expect(placesHint(PLACES)).toBe("Uni, Gym");
    expect(placesHint([])).toBe("No places yet");
    const html = renderToStaticMarkup(<PlacesRow homeAddress="Rua Augusta 1" places={PLACES} onPlaces={() => {}} />);
    expect(html).toContain(">Places</p>");
    expect(html).toContain("Uni, Gym");
    expect(html).not.toContain("Home, Uni");
    expect(html).toContain(">Manage</button>");
  });
});

describe("the list of places", () => {
  const list = (places = PLACES, home = "Rua Augusta 1") =>
    renderToStaticMarkup(<PlacesList homeAddress={home} places={places} onPlaces={() => {}} onClose={() => {}} />);

  it("shows Home first, then each place with Change and Delete, then Add place", () => {
    const html = list();
    expect(html.indexOf(">Home</p>")).toBeLessThan(html.indexOf(">Uni</p>"));
    expect(html.indexOf(">Uni</p>")).toBeLessThan(html.indexOf(">Gym</p>"));
    for (const name of ["Uni", "Gym"]) {
      expect(html).toContain(`aria-label="Change ${name}"`);
      expect(html).toContain(`aria-label="Delete ${name}"`);
    }
    expect(html).not.toContain('aria-label="Delete Home"');
    expect(html).toContain("Add place</button>");
  });

  it("says when Home is not set, and has no Add place at 10 places", () => {
    expect(list([], "")).toContain("Not set yet");
    const ten = Array.from({ length: 10 }, (_, i) => ({ ...PLACES[0], id: `${PLACES[0].id.slice(0, -2)}${String(i).padStart(2, "0")}`, name: `P${i}` }));
    const html = list(ten);
    expect(html).not.toContain("Add place</button>");
    expect(html).toContain("the most there can be");
  });
});
