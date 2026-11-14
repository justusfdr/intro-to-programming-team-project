import { describe, expect, it } from "vitest";
import { citiesFrom, cityLabelOf, labelOf, suggestionsFrom } from "./places";

const house = { street: "Rua Augusta", housenumber: "100", postcode: "1100-050", city: "Lisboa", country: "Portugal" };
const feature = (properties: Record<string, unknown>, coordinates: unknown = [-9.13, 38.71]) => ({ geometry: { coordinates }, properties });

describe("labelOf", () => {
  it("writes street and number, then postcode and town, then country", () => {
    expect(labelOf(house)).toBe("Rua Augusta 100, 1100-050 Lisboa, Portugal");
  });
  it("works without a number or without a postcode", () => {
    expect(labelOf({ street: "Rua Augusta", city: "Lisboa", country: "Portugal" })).toBe("Rua Augusta, Lisboa, Portugal");
  });
  it("uses the place's name when there is no street", () => {
    expect(labelOf({ name: "Nova SBE", city: "Carcavelos", country: "Portugal" })).toBe("Nova SBE, Carcavelos, Portugal");
  });
  it("does not say the same thing twice in a row", () => {
    expect(labelOf({ name: "Lisboa", city: "Lisboa", country: "Portugal" })).toBe("Lisboa, Portugal");
  });
  it("gives nothing when there is too little to show", () => {
    expect(labelOf({})).toBe("");
    expect(labelOf({ country: "Portugal" })).toBe("");
  });
});

describe("suggestionsFrom", () => {
  it("keeps results that have a label and a position", () => {
    expect(suggestionsFrom({ features: [feature(house)] })).toEqual([{ label: "Rua Augusta 100, 1100-050 Lisboa, Portugal", lat: 38.71, lon: -9.13 }]);
  });
  it("skips results without a label or without a usable position", () => {
    const answer = { features: [feature({}), feature(house, []), feature(house, ["x", 1]), feature(house, [Infinity, 1])] };
    expect(suggestionsFrom(answer)).toEqual([]);
  });
  it("lists a label only once and stops at the limit", () => {
    const many = Array.from({ length: 9 }, (_, i) => feature({ ...house, housenumber: String(i) }));
    expect(suggestionsFrom({ features: [feature(house), feature(house), ...many] }, 3)).toHaveLength(3);
    expect(suggestionsFrom({ features: [feature(house), feature(house)] })).toHaveLength(1);
  });
  it("gives an empty list for an answer of the wrong shape", () => {
    for (const bad of [null, undefined, "x", 3, {}, { features: "no" }]) expect(suggestionsFrom(bad)).toEqual([]);
  });
});

import { confirmedFrom, houseNumberIn } from "./places";

describe("houseNumberIn", () => {
  it("finds the number in a typed address", () => {
    expect(houseNumberIn("rua das madres 66")).toBe("66");
    expect(houseNumberIn("Rua Augusta 100, Lisboa")).toBe("100");
    expect(houseNumberIn("Rua X 12B")).toBe("12B");
  });
  it("is not fooled by a postcode or by no number at all", () => {
    expect(houseNumberIn("Rua das Madres, 1200-861 Lisboa")).toBe("");
    expect(houseNumberIn("Rua das Madres")).toBe("");
    expect(houseNumberIn("Rua X 12345")).toBe("");
  });
});

describe("confirmedFrom", () => {
  const street = { lat: "38.70", lon: "-9.15", address: { road: "Rua das Madres", postcode: "1200-863", city: "Lisboa", country: "Portugal" } };
  it("keeps the typed number when OpenStreetMap knows the street but not the number", () => {
    expect(confirmedFrom([street], "rua das madres 66")).toEqual({ label: "Rua das Madres 66, 1200-863 Lisboa, Portugal", lat: 38.7, lon: -9.15 });
  });
  it("uses the number OpenStreetMap knows", () => {
    const house = { ...street, address: { ...street.address, house_number: "10" } };
    expect(confirmedFrom([house], "rua das madres 66")?.label).toBe("Rua das Madres 10, 1200-863 Lisboa, Portugal");
  });
  it("finds nothing in an empty or broken answer", () => {
    for (const bad of [[], null, "x", [{ lat: "x", lon: "y", address: street.address }], [{ lat: "1", lon: "2", address: {} }]]) expect(confirmedFrom(bad, "x 1")).toBeNull();
  });
});

import { fitsTyped } from "./places";

describe("fitsTyped", () => {
  it("drops a suggestion whose street only starts like the typed one", () => {
    expect(fitsTyped("Rua das Madressilvas 66, 12240-370 São José dos Campos, Brazil", "rua das madres 66")).toBe(false);
  });
  it("keeps a suggestion with the typed street name", () => {
    expect(fitsTyped("Rua das Madres 66, 1200-863 Lisboa, Portugal", "rua das madres 66")).toBe(true);
    expect(fitsTyped("Rua Augusta 100, 1100-050 Lisboa, Portugal", "rua augusta 100 lisbon")).toBe(true);
  });
  it("lets the start of a word count while it is still being typed", () => {
    expect(fitsTyped("Rua Augusta, Lisboa, Portugal", "rua augu")).toBe(true);
    expect(fitsTyped("Rua Augusta, Lisboa, Portugal", "rua augu ")).toBe(false);
  });
  it("ignores accents and capitals", () => {
    expect(fitsTyped("Avenida da República, Lisboa, Portugal", "AVENIDA DA REPUBLICA")).toBe(true);
  });
  it("keeps everything when only numbers were typed", () => {
    expect(fitsTyped("Rua Augusta 100, Lisboa, Portugal", "100")).toBe(true);
  });
});

// Cities for the time zone in the settings (Photon answers with layer=city; shapes copied from real answers).
describe("cityLabelOf", () => {
  it("writes the city, its region when that has another name, and the country", () => {
    expect(cityLabelOf({ name: "Paris", state: "Texas", county: "Lamar", country: "United States" })).toBe("Paris, Texas, United States");
    expect(cityLabelOf({ name: "Kyiv", country: "Ukraine" })).toBe("Kyiv, Ukraine");
  });
  it("leaves out a region with the city's or the country's name", () => {
    expect(cityLabelOf({ name: "Lisbon", county: "Lisbon", country: "Portugal" })).toBe("Lisbon, Portugal");
    expect(cityLabelOf({ name: "Singapore", state: "Singapore", country: "Singapore" })).toBe("Singapore, Singapore");
  });
  it("is empty without a name or a country", () => {
    expect(cityLabelOf({ name: "Lisbon" })).toBe("");
    expect(cityLabelOf({ country: "Portugal" })).toBe("");
    expect(cityLabelOf({ name: 3, country: "Portugal" })).toBe("");
  });
});

describe("citiesFrom", () => {
  it("keeps cities with a label and a position, without repeats, up to the limit", () => {
    const answer = {
      features: [
        feature({ name: "Lisbon", county: "Lisbon", country: "Portugal" }, [-9.1365919, 38.7077507]),
        feature({ name: "Lisbon", county: "Lisbon", country: "Portugal" }, [-9.1, 38.7]),
        feature({ name: "Lisbon", state: "Iowa", country: "United States" }, [-91.3854913, 41.9211165]),
        feature({ name: "Nowhere" }, [1, 2]),
        feature({ name: "Broken", country: "Portugal" }, ["x", 2]),
      ],
    };
    expect(citiesFrom(answer)).toEqual([
      { label: "Lisbon, Portugal", lat: 38.7077507, lon: -9.1365919 },
      { label: "Lisbon, Iowa, United States", lat: 41.9211165, lon: -91.3854913 },
    ]);
    expect(citiesFrom(answer, 1)).toHaveLength(1);
  });
  it("is empty for an answer of the wrong shape", () => {
    for (const bad of [null, {}, { features: "x" }, "x"]) expect(citiesFrom(bad)).toEqual([]);
  });
});
