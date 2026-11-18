import "server-only";

// The weather module: the only place that talks to Open-Meteo (AGENTS.md: one module per service). No key
// is needed. Only coordinates go out, rounded to two decimals (about 1 km) before they get here, and
// rounded again here so no caller can send more (R48). Plain `fetch`, 5 seconds at most. Nothing is
// logged but the kind of a failure. The answer is kept in memory for 30 minutes per rounded place.
import { roundCoordinate, skyOf } from "@/lib/widgets/weather";
import type { Forecast, WeatherService } from "./types";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 5000;
const KEEP_MS = 30 * 60 * 1000;
const HOURS_SHOWN = 24;
const DAYS_SHOWN = 7;
const MAX_CACHED = 500;

type Raw = {
  utc_offset_seconds?: unknown;
  current?: { temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown; wind_speed_10m?: unknown };
  hourly?: {
    time?: unknown;
    temperature_2m?: unknown;
    precipitation_probability?: unknown;
    precipitation?: unknown;
    weather_code?: unknown;
    is_day?: unknown;
    wind_speed_10m?: unknown;
    wind_direction_10m?: unknown;
  };
  daily?: { time?: unknown; weather_code?: unknown; temperature_2m_max?: unknown; temperature_2m_min?: unknown; precipitation_probability_max?: unknown };
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Open-Meteo writes local times without an offset ("2026-11-16T10:00"); with the offset it is an instant. */
function instantOf(local: unknown, offsetSeconds: number): number | null {
  if (typeof local !== "string") return null;
  const ms = Date.parse(`${local}:00Z`);
  return Number.isNaN(ms) ? null : ms - offsetSeconds * 1000;
}

/** Turns Open-Meteo's answer into the forecast (whole degrees, next 24 full hours after `now`, 7 days from today), or null. */
export function forecastFrom(raw: unknown, now: Date): Forecast | null {
  const r = raw as Raw | null;
  const offset = isNum(r?.utc_offset_seconds) ? r.utc_offset_seconds : 0;
  const current = r?.current;
  if (!current || !isNum(current.temperature_2m) || !isNum(current.weather_code)) return null;

  // Days: today's local date first. A kept answer may be from yesterday, so days before today are dropped.
  const today = new Date(now.getTime() + offset * 1000).toISOString().slice(0, 10);
  const dates = list(r?.daily?.time);
  const dayCodes = list(r?.daily?.weather_code);
  const highs = list(r?.daily?.temperature_2m_max);
  const lows = list(r?.daily?.temperature_2m_min);
  const dayRains = list(r?.daily?.precipitation_probability_max);
  const days: Forecast["days"] = [];
  for (let i = 0; i < dates.length && days.length < DAYS_SHOWN; i++) {
    const date = dates[i];
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) continue;
    const code = dayCodes[i];
    const high = highs[i];
    const low = lows[i];
    if (!isNum(code) || !isNum(high) || !isNum(low)) continue;
    const rain = dayRains[i];
    days.push({ date, sky: skyOf(code), high: Math.round(high), low: Math.round(low), rain: isNum(rain) ? Math.round(rain) : 0 });
  }
  if (days.length === 0) return null;

  const times = list(r?.hourly?.time);
  const temps = list(r?.hourly?.temperature_2m);
  const rains = list(r?.hourly?.precipitation_probability);
  const amounts = list(r?.hourly?.precipitation);
  const codes = list(r?.hourly?.weather_code);
  const nights = list(r?.hourly?.is_day);
  const winds = list(r?.hourly?.wind_speed_10m);
  const directions = list(r?.hourly?.wind_direction_10m);
  const hours: Forecast["hours"] = [];
  for (let i = 0; i < times.length && hours.length < HOURS_SHOWN; i++) {
    const at = instantOf(times[i], offset);
    if (at === null || at <= now.getTime()) continue;
    const temp = temps[i];
    const code = codes[i];
    if (!isNum(temp) || !isNum(code)) continue;
    const rain = rains[i];
    const amount = amounts[i];
    const wind = winds[i];
    const direction = directions[i];
    hours.push({
      time: new Date(at).toISOString(),
      temp: Math.round(temp),
      sky: skyOf(code),
      isDay: nights[i] === 1,
      rain: isNum(rain) ? Math.round(rain) : 0,
      precip: isNum(amount) ? Math.round(amount * 10) / 10 : 0,
      wind: isNum(wind) ? Math.round(wind) : 0,
      windDir: isNum(direction) ? Math.round(direction) : 0,
    });
  }
  if (hours.length === 0) return null;

  return {
    temp: Math.round(current.temperature_2m),
    sky: skyOf(current.weather_code),
    isDay: current.is_day === 1,
    high: days[0].high,
    low: days[0].low,
    wind: isNum(current.wind_speed_10m) ? Math.round(current.wind_speed_10m) : 0,
    hours,
    days,
  };
}

export type OpenMeteoOptions = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Answers kept for 30 minutes, by rounded place. Each test passes its own. */
  cache?: Map<string, { at: number; value: unknown }>;
};

/** Answers kept for 30 minutes, shared by all requests on this server. */
const shared = new Map<string, { at: number; value: unknown }>();

export function openMeteo({ fetchImpl = fetch, now = () => new Date(), cache = shared }: OpenMeteoOptions = {}): WeatherService {
  return {
    async forecast(latitude, longitude) {
      const lat = roundCoordinate(latitude);
      const lon = roundCoordinate(longitude);
      const key = `${lat},${lon}`;
      try {
        let raw: unknown;
        const hit = cache.get(key);
        if (hit && now().getTime() - hit.at < KEEP_MS) {
          raw = hit.value;
        } else {
          const url = new URL(FORECAST_URL);
          url.search = new URLSearchParams({
            latitude: String(lat),
            longitude: String(lon),
            current: "temperature_2m,weather_code,is_day,wind_speed_10m",
            hourly: "temperature_2m,precipitation_probability,weather_code,is_day,precipitation,wind_speed_10m,wind_direction_10m",
            daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            timezone: "auto",
            forecast_days: "8",
            wind_speed_unit: "kmh",
          }).toString();
          const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
          if (!response.ok) throw new Error(`status ${response.status}`);
          raw = await response.json();
          // Only a good answer is kept.
          if (!forecastFrom(raw, now())) throw new Error("unreadable answer");
          cache.set(key, { at: now().getTime(), value: raw });
          if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
        }
        return forecastFrom(raw, now());
      } catch (error) {
        console.error(`[open-meteo] ${error instanceof Error ? error.message : "no answer"}`);
        return null;
      }
    },
  };
}
