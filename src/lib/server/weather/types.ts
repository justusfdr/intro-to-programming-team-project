import "server-only";

// What the weather widget (spec 47, R48) needs from the outside world: the forecast for a place. The real
// one asks Open-Meteo (open-meteo.ts); tests use a stand-in (fake.ts).
import type { WeatherDto } from "@/lib/widgets/weather";

/** The weather without its place: whole degrees, the sky as a word, the next 24 full hours, wind and rain amounts, and 7 days. */
export type Forecast = Omit<WeatherDto, "place" | "source">;

export interface WeatherService {
  /**
   * The forecast for a place, given as coordinates already rounded to two decimals (R48), or null when it
   * cannot be had (the service is down, too slow, or its answer cannot be read). Never throws.
   */
  forecast(lat: number, lon: number): Promise<Forecast | null>;
}
