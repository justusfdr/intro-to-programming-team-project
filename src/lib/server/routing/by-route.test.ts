// Issue #227: one question to the routing service per route, not per time.
import { describe, expect, it } from "vitest";
import { oncePerRoute } from "./by-route";
import { FakeRouting } from "./fake";

const A = { lat: 38.7, lon: -9.1 };
const B = { lat: 38.6, lon: -9.3 };

describe("oncePerRoute", () => {
  it("asks once for a route by car and counts the departure back from each arrival", async () => {
    const fake = new FakeRouting();
    const routing = oncePerRoute(fake);
    const one = await routing.trip("driving", A, B, new Date("2026-11-17T10:00:00Z"));
    const two = await routing.trip("driving", A, B, new Date("2026-11-18T15:00:00Z"));
    expect(fake.asked).toHaveLength(1);
    expect(one).toEqual({ minutes: 25, departAt: new Date("2026-11-17T09:35:00Z") });
    expect(two).toEqual({ minutes: 25, departAt: new Date("2026-11-18T14:35:00Z") });
  });

  it("another route or another way is another question", async () => {
    const fake = new FakeRouting();
    const routing = oncePerRoute(fake);
    await routing.trip("driving", A, B, new Date("2026-11-17T10:00:00Z"));
    await routing.trip("walking", A, B, new Date("2026-11-17T10:00:00Z"));
    await routing.trip("driving", B, A, new Date("2026-11-17T10:00:00Z"));
    expect(fake.asked).toHaveLength(3);
  });

  it("public transport depends on the timetable: asked for each arrival", async () => {
    const fake = new FakeRouting();
    const routing = oncePerRoute(fake);
    await routing.trip("transit", A, B, new Date("2026-11-17T10:00:00Z"));
    await routing.trip("transit", A, B, new Date("2026-11-17T12:00:00Z"));
    expect(fake.asked).toHaveLength(2);
  });

  it("a route with no trip stays none; a service that is down throws each time", async () => {
    const fake = new FakeRouting();
    fake.minutes = {};
    const routing = oncePerRoute(fake);
    expect(await routing.trip("driving", A, B, new Date("2026-11-17T10:00:00Z"))).toBeNull();
    expect(await routing.trip("driving", A, B, new Date("2026-11-17T12:00:00Z"))).toBeNull();
    expect(fake.asked).toHaveLength(1);
    fake.down = true;
    await expect(routing.trip("walking", A, B, new Date("2026-11-17T10:00:00Z"))).rejects.toThrow();
  });
});
