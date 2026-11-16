// "From" in Getting there: where the trip to the event starts. Folded it shows the choice in words;
// a saved place shows its name, a deleted place counts as the standard ("Automatic").
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SavedPlacesProvider } from "@/components/places/SavedPlaces";
import { TravelSection } from "./TravelSection";
import { TravelFromField, fromLabel } from "./TravelFrom";

const UNI = { id: "0b1e2c3d-1111-4222-8333-944455556666", name: "Uni", address: "Campus 1" };

const render = (value: string | null) =>
  renderToStaticMarkup(
    <SavedPlacesProvider places={[UNI]}>
      <TravelFromField value={value} onChange={() => {}} />
    </SavedPlacesProvider>,
  );

describe("From", () => {
  it("names the choice: Automatic, Home, Last event, a place's name or the typed address", () => {
    expect(fromLabel(null, [UNI])).toBe("Automatic");
    expect(fromLabel({ kind: "home" }, [UNI])).toBe("Home");
    expect(fromLabel({ kind: "last" }, [UNI])).toBe("Last event");
    expect(fromLabel({ kind: "place", id: UNI.id }, [UNI])).toBe("Uni");
    expect(fromLabel({ kind: "place", id: UNI.id }, [])).toBe("Automatic");
    expect(fromLabel({ kind: "address", address: "Rua 1" }, [UNI])).toBe("Rua 1");
  });

  it("is one folded line with the standard explained, and shows the place's name when one is chosen", () => {
    const standard = render(null);
    expect(standard).toMatch(/aria-expanded="false"[^>]*>From<span[^>]*>Automatic<\/span>/);
    expect(standard).toContain("The place of the event before, else home.");
    expect(standard).not.toContain('role="group" aria-label="From"');
    expect(render(`place:${UNI.id}`)).toContain(">Uni</span>");
  });

  it("shows the typed address in a field", () => {
    expect(render("address:Rua Augusta 1")).toMatch(/aria-label="Start address"[^>]*value="Rua Augusta 1"/);
  });

  it("sits in Getting there when the editor passes it, and not otherwise", () => {
    expect(renderToStaticMarkup(<TravelSection value={null} onChange={() => {}} from={null} onFrom={() => {}} />)).toContain(">From<");
    expect(renderToStaticMarkup(<TravelSection value={null} onChange={() => {}} />)).not.toContain(">From<");
  });
});
