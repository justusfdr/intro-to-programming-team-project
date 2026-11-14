// The time zone at a place on the map (the library answers here, without internet).
import { describe, expect, it } from "vitest";
import { timeZoneAt } from "./time-zone";

describe("timeZoneAt", () => {
  it("finds the time zone of cities around the world", () => {
    expect(timeZoneAt(38.7077507, -9.1365919)).toBe("Europe/Lisbon");
    expect(timeZoneAt(52.52, 13.405)).toBe("Europe/Berlin");
    expect(timeZoneAt(40.7128, -74.006)).toBe("America/New_York");
    expect(timeZoneAt(-23.55, -46.63)).toBe("America/Sao_Paulo");
    expect(timeZoneAt(35.68, 139.69)).toBe("Asia/Tokyo");
    // Paris in Texas is not Paris in France.
    expect(timeZoneAt(33.6617962, -95.555513)).toBe("America/Chicago");
  });

  it("answers with a name the settings accept, also for a city whose zone was renamed (Kyiv)", () => {
    const zone = timeZoneAt(50.4500336, 30.5241361)!;
    expect(["Europe/Kyiv", "Europe/Kiev"]).toContain(zone);
    expect(new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone).toBe(zone);
  });

  it("is null for a position that does not exist", () => {
    for (const [lat, lon] of [[91, 0], [0, 181], [-91, 0], [NaN, 0], [0, Infinity]]) expect(timeZoneAt(lat, lon)).toBeNull();
  });
});
