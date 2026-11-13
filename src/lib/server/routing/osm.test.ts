// How the real routing reads the services' answers (shapes copied from real answers, no internet).
import { describe, expect, it } from "vitest";
import { minutesFromOsrm, pointFromNominatim, tripFromTransitous } from "./osm";

describe("pointFromNominatim", () => {
  it("takes the first result's position", () => {
    expect(pointFromNominatim([{ lat: "38.7086419", lon: "-9.1549378" }, { lat: "1", lon: "2" }])).toEqual({ lat: 38.7086419, lon: -9.1549378 });
  });
  it("is null for no result or a broken one", () => {
    for (const bad of [[], null, {}, "x", [{ lat: "x", lon: "1" }]]) expect(pointFromNominatim(bad)).toBeNull();
  });
});

describe("minutesFromOsrm", () => {
  it("turns the route's seconds into whole minutes, at least one", () => {
    expect(minutesFromOsrm({ code: "Ok", routes: [{ duration: 1156.2 }] })).toBe(19);
    expect(minutesFromOsrm({ code: "Ok", routes: [{ duration: 10 }] })).toBe(1);
  });
  it("is null when no route was found", () => {
    for (const bad of [{ code: "NoRoute", routes: [] }, { code: "Ok", routes: [] }, null, { code: "Ok", routes: [{ duration: -5 }] }]) expect(minutesFromOsrm(bad)).toBeNull();
  });
});

describe("tripFromTransitous", () => {
  const arriveBy = new Date("2026-11-16T10:00:00Z");
  const answer = {
    itineraries: [
      { startTime: "2026-11-16T08:41:00Z", endTime: "2026-11-16T09:27:00Z" },
      { startTime: "2026-11-16T09:01:00Z", endTime: "2026-11-16T09:44:00Z" },
      { startTime: "2026-11-16T09:20:00Z", endTime: "2026-11-16T10:05:00Z" },
    ],
  };
  it("takes the journey that leaves last but still arrives in time", () => {
    expect(tripFromTransitous(answer, arriveBy)).toEqual({ departAt: new Date("2026-11-16T09:01:00Z"), minutes: 43 });
  });
  it("is null when every journey arrives late, or for an answer of the wrong shape", () => {
    expect(tripFromTransitous({ itineraries: [answer.itineraries[2]] }, arriveBy)).toBeNull();
    for (const bad of [null, {}, { itineraries: "x" }, { itineraries: [{ startTime: "x", endTime: "y" }] }]) expect(tripFromTransitous(bad, arriveBy)).toBeNull();
  });
});
