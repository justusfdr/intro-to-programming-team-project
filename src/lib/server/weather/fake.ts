import "server-only";

// A stand-in for the weather service in tests: a fixed forecast, no internet.
import type { Forecast, WeatherService } from "./types";

export const SUNNY: Forecast = {
  temp: 14,
  sky: "clear",
  isDay: true,
  high: 17,
  low: 9,
  wind: 12,
  hours: [
    { time: "2026-11-16T10:00:00.000Z", temp: 15, sky: "clear", isDay: true, rain: 0, precip: 0, wind: 10, windDir: 270 },
    { time: "2026-11-16T11:00:00.000Z", temp: 16, sky: "partly", isDay: true, rain: 10, precip: 0, wind: 12, windDir: 280 },
    { time: "2026-11-16T12:00:00.000Z", temp: 16, sky: "cloudy", isDay: true, rain: 35, precip: 0.2, wind: 14, windDir: 290 },
    { time: "2026-11-16T13:00:00.000Z", temp: 15, sky: "rain", isDay: true, rain: 60, precip: 1.4, wind: 18, windDir: 300 },
  ],
  days: [
    { date: "2026-11-16", sky: "clear", high: 17, low: 9, rain: 60 },
    { date: "2026-11-17", sky: "rain", high: 15, low: 8, rain: 80 },
    { date: "2026-11-18", sky: "cloudy", high: 14, low: 7, rain: 30 },
    { date: "2026-11-19", sky: "partly", high: 16, low: 8, rain: 10 },
    { date: "2026-11-20", sky: "clear", high: 18, low: 9, rain: 0 },
    { date: "2026-11-21", sky: "fog", high: 13, low: 6, rain: 5 },
    { date: "2026-11-22", sky: "snow", high: 3, low: -2, rain: 70 },
  ],
};

export class FakeWeather implements WeatherService {
  /** What it answers; null makes it behave like a service that is down. */
  answer: Forecast | null = SUNNY;
  /** The coordinates it was asked for, in order: tests check that only rounded ones arrive. */
  asked: { lat: number; lon: number }[] = [];

  async forecast(lat: number, lon: number): Promise<Forecast | null> {
    this.asked.push({ lat, lon });
    return this.answer;
  }
}
