// Tests for the Open-Meteo module with a stand-in for fetch: what it asks, what it makes of the answer,
// the 30-minute memory, and what it does when the service fails. No internet.
import { describe, expect, it } from "vitest";
import { forecastFrom, openMeteo } from "./open-meteo";

// Lisbon in winter is UTC+0; use Berlin (UTC+1, 3600 s) to check the offset.
const RAW = {
  utc_offset_seconds: 3600,
  current: { time: "2026-11-16T10:00", temperature_2m: 14.4, weather_code: 2, is_day: 1 },
  hourly: {
    time: ["2026-11-16T09:00", "2026-11-16T10:00", "2026-11-16T11:00", "2026-11-16T12:00", "2026-11-16T13:00", "2026-11-16T14:00", "2026-11-16T15:00"],
    temperature_2m: [12.2, 14.4, 15.5, 16.49, 16.5, 15, 13],
    precipitation_probability: [0, 0, 10, 35, 60, 80, 90],
    weather_code: [0, 2, 3, 61, 95, 71, 45],
    is_day: [1, 1, 1, 1, 1, 0, 0],
  },
  daily: { temperature_2m_max: [17.4, 12], temperature_2m_min: [8.5, 7] },
};

// 09:20 UTC is 10:20 in Berlin, so the next full hours are 11:00, 12:00, 13:00, 14:00 local.
const NOW = new Date("2026-11-16T09:20:00Z");

describe("forecastFrom", () => {
  it("rounds to whole degrees and takes the next four full hours after now, as UTC instants", () => {
    expect(forecastFrom(RAW, NOW)).toEqual({
      temp: 14,
      sky: "partly",
      isDay: true,
      high: 17,
      low: 9,
      hours: [
        { time: "2026-11-16T10:00:00.000Z", temp: 16, sky: "cloudy", isDay: true, rain: 10 },
        { time: "2026-11-16T11:00:00.000Z", temp: 16, sky: "rain", isDay: true, rain: 35 },
        { time: "2026-11-16T12:00:00.000Z", temp: 17, sky: "storm", isDay: true, rain: 60 },
        { time: "2026-11-16T13:00:00.000Z", temp: 15, sky: "snow", isDay: false, rain: 80 },
      ],
    });
  });

  it("an hour that starts exactly now is not 'after now'", () => {
    const hours = forecastFrom(RAW, new Date("2026-11-16T10:00:00Z"))!.hours;
    expect(hours[0].time).toBe("2026-11-16T11:00:00.000Z");
  });

  it.each([null, {}, "x", { current: {} }, { ...RAW, daily: {} }, { ...RAW, hourly: {} }])("is null for an answer it cannot read (%j)", (raw) => {
    expect(forecastFrom(raw, NOW)).toBeNull();
  });
});

function fakeFetch(answer: unknown, status = 200) {
  const urls: string[] = [];
  const fetchImpl = (async (url: URL | string) => {
    urls.push(String(url));
    return new Response(JSON.stringify(answer), { status });
  }) as typeof fetch;
  return { fetchImpl, urls };
}

describe("openMeteo", () => {
  it("asks only for the rounded place and the fields it uses", async () => {
    const { fetchImpl, urls } = fakeFetch(RAW);
    const service = openMeteo({ fetchImpl, now: () => NOW, cache: new Map() });
    expect(await service.forecast(38.7223456, -9.1393789)).toMatchObject({ temp: 14 });
    expect(urls).toHaveLength(1);
    const url = new URL(urls[0]);
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: "38.72",
      longitude: "-9.14",
      current: "temperature_2m,weather_code,is_day",
      hourly: "temperature_2m,precipitation_probability,weather_code,is_day",
      daily: "temperature_2m_max,temperature_2m_min",
      timezone: "auto",
      forecast_days: "2",
    });
  });

  it("keeps an answer for 30 minutes per place, then asks again", async () => {
    let now = NOW.getTime();
    const { fetchImpl, urls } = fakeFetch(RAW);
    const service = openMeteo({ fetchImpl, now: () => new Date(now), cache: new Map() });
    await service.forecast(38.72, -9.14);
    now += 29 * 60_000;
    await service.forecast(38.72, -9.14);
    expect(urls).toHaveLength(1);
    await service.forecast(41.15, -8.61); // another place
    expect(urls).toHaveLength(2);
    now += 2 * 60_000;
    await service.forecast(38.72, -9.14);
    expect(urls).toHaveLength(3);
  });

  it("is null, and does not keep anything, when the service answers with an error or nonsense", async () => {
    for (const [answer, status] of [[{}, 500], [{ nothing: true }, 200]] as const) {
      const cache = new Map();
      const { fetchImpl } = fakeFetch(answer, status);
      expect(await openMeteo({ fetchImpl, now: () => NOW, cache }).forecast(38.72, -9.14)).toBeNull();
      expect(cache.size).toBe(0);
    }
  });

  it("is null when the service cannot be reached", async () => {
    const fetchImpl = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await openMeteo({ fetchImpl, now: () => NOW, cache: new Map() }).forecast(38.72, -9.14)).toBeNull();
  });
});
