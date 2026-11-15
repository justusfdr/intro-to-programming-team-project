// The map of an event's place in the preview panel (spec 35, R27): OpenStreetMap's own embedded map and a
// link to the same place on openstreetmap.org. The addresses are built from two numbers only, checked and
// rounded here, so nothing a user typed can ever reach them. Pure, tested in osm-embed.test.ts.

export type MapUrls = {
  /** For the iframe: OpenStreetMap's embed with a marker on the place. */
  embed: string;
  /** "Open in OpenStreetMap". */
  open: string;
};

/** Half the side of the shown box, in metres: about 600 m across. */
const HALF_BOX_M = 300;
/** Metres per degree of latitude (and of longitude at the equator). */
const M_PER_DEGREE = 111_320;
/** Near the poles a degree of longitude is tiny; the box stops growing past this latitude. */
const MAX_LAT_FOR_BOX = 85;

/** A number with exactly five decimals (about 1 m), as text: never an exponent, never "-0.00000". */
function fixed5(n: number): string {
  const text = (Math.round(n * 1e5) / 1e5).toFixed(5);
  return text === "-0.00000" ? "0.00000" : text;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * The two map addresses for a place, or null when the numbers are not a place on Earth (not finite, a
 * latitude outside −90 to 90 or a longitude outside −180 to 180). Only numbers are accepted: a string is
 * refused, even one that looks like a number.
 */
export function mapUrls(lat: unknown, lon: unknown): MapUrls | null {
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const la = Math.round(lat * 1e5) / 1e5;
  const lo = Math.round(lon * 1e5) / 1e5;

  const dLat = HALF_BOX_M / M_PER_DEGREE;
  const dLon = HALF_BOX_M / (M_PER_DEGREE * Math.cos((Math.min(Math.abs(la), MAX_LAT_FOR_BOX) * Math.PI) / 180));
  const west = fixed5(clamp(lo - dLon, -180, 180));
  const east = fixed5(clamp(lo + dLon, -180, 180));
  const south = fixed5(clamp(la - dLat, -90, 90));
  const north = fixed5(clamp(la + dLat, -90, 90));
  const mlat = fixed5(la);
  const mlon = fixed5(lo);

  return {
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${west},${south},${east},${north}&layer=mapnik&marker=${mlat},${mlon}`,
    open: `https://www.openstreetmap.org/?mlat=${mlat}&mlon=${mlon}#map=16/${mlat}/${mlon}`,
  };
}
