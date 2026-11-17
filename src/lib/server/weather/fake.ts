import "server-only";

// A stand-in for the weather service in tests: a fixed forecast, no internet.
import type { Forecast, WeatherService } from "./types";

export const SUNNY: Forecast = {
  temp: 14,
  sky: "clear",
  isDay: true,
  high: 17,
  low: 9,
  hours: [
    { time: "2026-11-16T10:00:00.000Z", temp: 15, sky: "clear", isDay: true, rain: 0 },
    { time: "2026-11-16T11:00:00.000Z", temp: 16, sky: "partly", isDay: true, rain: 10 },
    { time: "2026-11-16T12:00:00.000Z", temp: 16, sky: "cloudy", isDay: true, rain: 35 },
    { time: "2026-11-16T13:00:00.000Z", temp: 15, sky: "rain", isDay: true, rain: 60 },
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
