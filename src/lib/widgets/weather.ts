// The weather widget's words and pictures (spec 45), shared by the server (which turns Open-Meteo's
// numbers into these) and the widget. WMO weather codes: https://open-meteo.com/en/docs#weathervariables

export type Sky = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** Where the weather is for (R47): the device's place, the place of the event now or just before, or home. */
export type WeatherSource = "device" | "event" | "home";

export type WeatherHour = { time: string; temp: number; sky: Sky; isDay: boolean; rain: number };

export type WeatherDto = {
  place: string;
  source: WeatherSource;
  temp: number;
  sky: Sky;
  isDay: boolean;
  high: number;
  low: number;
  /** The next four full hours. `time` is an ISO string in UTC; `rain` the chance in percent. */
  hours: WeatherHour[];
};

/** What the weather action answers. */
export type WeatherAnswer = { status: "ok"; weather: WeatherDto } | { status: "no_place" | "unavailable"; message: string };

/** The sky for a WMO weather code. */
export function skyOf(code: number): Sky {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

/** "Sunny" by day and "Clear" by night, "Partly cloudy", … */
export function skyLabel(sky: Sky, isDay: boolean): string {
  switch (sky) {
    case "clear":
      return isDay ? "Sunny" : "Clear";
    case "partly":
      return "Partly cloudy";
    case "cloudy":
      return "Cloudy";
    case "fog":
      return "Fog";
    case "drizzle":
      return "Drizzle";
    case "rain":
      return "Rain";
    case "snow":
      return "Snow";
    case "storm":
      return "Thunderstorm";
  }
}

/** The chance of rain is shown from 30 percent on, never below (the widget stays quiet). */
export const RAIN_SHOWN_FROM = 30;

/** Rounds a coordinate to two decimals (about 1 km), before it leaves the server (R47). */
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}
