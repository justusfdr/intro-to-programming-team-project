// The map addresses of the event preview (spec 35): built from two checked numbers only.
import { describe, expect, it } from "vitest";
import { mapUrls } from "./osm-embed";

describe("mapUrls", () => {
  it("builds OpenStreetMap's embed with a box of about 600 m and a marker, and the link to open it", () => {
    const urls = mapUrls(38.6797, -9.3197);
    expect(urls).not.toBeNull();
    const embed = new URL(urls!.embed);
    expect(`${embed.origin}${embed.pathname}`).toBe("https://www.openstreetmap.org/export/embed.html");
    expect(embed.searchParams.get("layer")).toBe("mapnik");
    expect(embed.searchParams.get("marker")).toBe("38.67970,-9.31970");
    const [west, south, east, north] = embed.searchParams.get("bbox")!.split(",").map(Number);
    // About 600 m from south to north (0.0054° of latitude) and from west to east at this latitude.
    expect((north - south) * 111_320).toBeCloseTo(600, -1);
    expect((east - west) * 111_320 * Math.cos((38.6797 * Math.PI) / 180)).toBeCloseTo(600, -1);
    expect(west).toBeLessThan(-9.3197);
    expect(east).toBeGreaterThan(-9.3197);
    expect(urls!.open).toBe("https://www.openstreetmap.org/?mlat=38.67970&mlon=-9.31970#map=16/38.67970/-9.31970");
  });

  it("rounds to five decimals and never writes an exponent", () => {
    const urls = mapUrls(38.123456789, 0.000000001)!;
    expect(urls.open).toBe("https://www.openstreetmap.org/?mlat=38.12346&mlon=0.00000#map=16/38.12346/0.00000");
    expect(urls.embed).not.toMatch(/e[-+]?\d/i);
    expect(mapUrls(-0.000001, -0.000001)!.open).toBe("https://www.openstreetmap.org/?mlat=0.00000&mlon=0.00000#map=16/0.00000/0.00000");
  });

  it("accepts the edges of the Earth and keeps the box inside them", () => {
    const north = new URL(mapUrls(90, 180)!.embed).searchParams.get("bbox")!.split(",").map(Number);
    expect(north[2]).toBeLessThanOrEqual(180);
    expect(north[3]).toBeLessThanOrEqual(90);
    expect(mapUrls(-90, -180)).not.toBeNull();
  });

  it("refuses everything that is not a place on Earth given as two numbers", () => {
    for (const [lat, lon] of [
      [91, 0],
      [-90.000001, 0],
      [0, 180.5],
      [0, -181],
      [Number.NaN, 0],
      [0, Number.POSITIVE_INFINITY],
      ["38.7", "-9.1"],
      ["38.7&marker=1,1", 0],
      [null, null],
      [undefined, 0],
      [{ valueOf: () => 1 }, 1],
    ] as [unknown, unknown][]) {
      expect(mapUrls(lat, lon), `${String(lat)}, ${String(lon)}`).toBeNull();
    }
  });
});
