// Tests for the Open-Meteo module with a stand-in for fetch: what it asks, what it makes of the answer,
// the 30-minute memory, and what it does when the service fails. No internet.
import { describe, expect, it } from "vitest";
import { forecastFrom, openMeteo } from "./open-meteo";

// Lisbon in winter is UTC+0; use Berlin (UTC+1, 3600 s) to check the offset.
// Hours run from 09:00 local on 16 Nov for 30 hours (into 17 Nov), days from 16 Nov for 8 days.
const HOUR_COUNT = 30;
const hourTimes = Array.from({ length: HOUR_COUNT }, (_, i) => {
  const at = new Date(Date.UTC(2026, 10, 16, 9 + i));
  return at.toISOString().slice(0, 13) + ":00";
});
const RAW = {
  utc_offset_seconds: 3600,
  current: { time: "2026-11-16T10:00", temperature_2m: 14.4, weather_code: 2, is_day: 1, wind_speed_10m: 11.6 },
  hourly: {
    time: hourTimes,
    temperature_2m: hourTimes.map((_, i) => [12.2, 14.4, 15.5, 16.49, 16.5, 15, 13][i] ?? 10 + (i % 5)),
    precipitation_probability: hourTimes.map((_, i) => [0, 0, 10, 35, 60, 80, 90][i] ?? 20),
    precipitation: hourTimes.map((_, i) => [0, 0, 0.04, 0.26, 1.25, 2.04, 3][i] ?? 0),
    weather_code: hourTimes.map((_, i) => [0, 2, 3, 61, 95, 71, 45][i] ?? 3),
    is_day: hourTimes.map((_, i) => ([1, 1, 1, 1, 1, 0, 0][i] ?? 0)),
    wind_speed_10m: hourTimes.map((_, i) => [5, 6.4, 12.5, 20.4, 30, 8, 3][i] ?? 7),
    wind_direction_10m: hourTimes.map((_, i) => [0, 45.4, 90, 180.5, 270, 315, 359.6][i] ?? 100),
  },
  daily: {
    time: ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"],
    weather_code: [2, 61, 3, 0, 71, 95, 45, 1],
    temperature_2m_max: [17.4, 12.5, 11, 14, 5.4, 9, 10, 11],
    temperature_2m_min: [8.5, 7, 6, 5, -0.6, 2, 3, 4],
    precipitation_probability_max: [35, 80.4, 20, 0, 55, 90, 10, 5],
  },
};

// 09:20 UTC is 10:20 in Berlin, so the next full hours are 11:00, 12:00, 13:00, ... local.
const NOW = new Date("2026-11-16T09:20:00Z");

describe("forecastFrom", () => {
  // Rewritten for spec 47 v2: 24 hours instead of 4, with rain amount, wind and wind direction; wind now and 7 days
  it("rounds to whole degrees and takes the next 24 full hours after now, as UTC instants, with wind and rain amounts", () => {
    const forecast = forecastFrom(RAW, NOW)!;
    expect(forecast).toMatchObject({ temp: 14, sky: "partly", isDay: true, high: 17, low: 9, wind: 12 });
    expect(forecast.hours).toHaveLength(24);
    expect(forecast.hours.slice(0, 4)).toEqual([
      { time: "2026-11-16T10:00:00.000Z", temp: 16, sky: "cloudy", isDay: true, rain: 10, precip: 0, wind: 13, windDir: 90 },
      { time: "2026-11-16T11:00:00.000Z", temp: 16, sky: "rain", isDay: true, rain: 35, precip: 0.3, wind: 20, windDir: 181 },
      { time: "2026-11-16T12:00:00.000Z", temp: 17, sky: "storm", isDay: true, rain: 60, precip: 1.3, wind: 30, windDir: 270 },
      { time: "2026-11-16T13:00:00.000Z", temp: 15, sky: "snow", isDay: false, rain: 80, precip: 2, wind: 8, windDir: 315 },
    ]);
    expect(forecast.hours[23].time).toBe("2026-11-17T09:00:00.000Z");
  });

  it("takes 7 days starting with today's local date: sky, rounded high and low, chance of rain", () => {
    const { days } = forecastFrom(RAW, NOW)!;
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: "2026-11-16", sky: "partly", high: 17, low: 9, rain: 35 });
    expect(days[1]).toEqual({ date: "2026-11-17", sky: "rain", high: 13, low: 7, rain: 80 });
    expect(days[4]).toEqual({ date: "2026-11-20", sky: "snow", high: 5, low: -1, rain: 55 });
    expect(days[6].date).toBe("2026-11-22");
  });

  it("the day boundary is the place's own: late on 16 Nov in UTC is already 17 Nov in Berlin", () => {
    // 23:30 UTC is 00:30 on the 17th in Berlin, so the 16th is dropped and today is the 17th.
    const { days, high, low } = forecastFrom(RAW, new Date("2026-11-16T23:30:00Z"))!;
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe("2026-11-17");
    expect(days[6].date).toBe("2026-11-23");
    expect([high, low]).toEqual([13, 7]);
  });

  it("fewer than 24 hours left in the answer gives the hours there are", () => {
    expect(forecastFrom(RAW, new Date("2026-11-17T04:00:00Z"))!.hours.length).toBeLessThan(24);
  });

  it("missing values: rain, amount, wind and direction become 0, wind now becomes 0, a day without a rain chance has 0", () => {
    const raw = {
      ...RAW,
      current: { temperature_2m: 14.4, weather_code: 2, is_day: 1 },
      hourly: { time: ["2026-11-16T11:00"], temperature_2m: [15], weather_code: [0], is_day: [1] },
      daily: { ...RAW.daily, precipitation_probability_max: [] },
    };
    const forecast = forecastFrom(raw, NOW)!;
    expect(forecast.wind).toBe(0);
    expect(forecast.hours).toEqual([{ time: "2026-11-16T10:00:00.000Z", temp: 15, sky: "clear", isDay: true, rain: 0, precip: 0, wind: 0, windDir: 0 }]);
    expect(forecast.days.every((d) => d.rain === 0)).toBe(true);
  });

  it("a day or an hour without its temperature or sky is skipped, not guessed", () => {
    const raw = {
      ...RAW,
      hourly: { ...RAW.hourly, temperature_2m: RAW.hourly.temperature_2m.map((t, i) => (i === 2 ? null : t)) },
      daily: { ...RAW.daily, temperature_2m_max: RAW.daily.temperature_2m_max.map((t, i) => (i === 1 ? null : t)) },
    };
    const forecast = forecastFrom(raw, NOW)!;
    // The hour at 11:00 local (10:00 UTC) had no temperature.
    expect(forecast.hours[0].time).toBe("2026-11-16T11:00:00.000Z");
    expect(forecast.hours).toHaveLength(24);
    expect(forecast.days.map((d) => d.date)).not.toContain("2026-11-17");
  });

  it("an hour that starts exactly now is not 'after now'", () => {
    const hours = forecastFrom(RAW, new Date("2026-11-16T10:00:00Z"))!.hours;
    expect(hours[0].time).toBe("2026-11-16T11:00:00.000Z");
  });

  // Rewritten for spec 47 v2: the days now come from daily.time and the day lists, so an answer without them is unreadable
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
  // Rewritten for spec 47 v2: it also asks for wind, rain amounts, the days' sky and 8 days in km/h
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
      current: "temperature_2m,weather_code,is_day,wind_speed_10m",
      hourly: "temperature_2m,precipitation_probability,weather_code,is_day,precipitation,wind_speed_10m,wind_direction_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "auto",
      forecast_days: "8",
      wind_speed_unit: "kmh",
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
