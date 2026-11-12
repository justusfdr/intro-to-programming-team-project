import "server-only";

// Reading the signed-in user's settings inside withUser.
import type { Query } from "./db";
import { DEFAULT_TIME_ZONE } from "./validation";
import { DEFAULT_DISPLAY, type Display, type TimeFormat } from "@/lib/time/display";
import type { SettingsData, TravelMode } from "@/lib/settings/types";
import { isView, type View } from "@/lib/events/views";

/** The user's time zone from app.settings (row-level security returns only their own row). */
export async function readTimeZone(query: Query): Promise<string> {
  const [row] = await query<{ time_zone: string }>("select time_zone from app.settings");
  return row?.time_zone ?? DEFAULT_TIME_ZONE;
}

type SettingsRow = {
  time_zone: string;
  home_address: string | null;
  travel_mode: TravelMode;
  travel_buffer_minutes: number;
  time_format: TimeFormat;
  day_start_hour: number;
  day_end_hour: number;
};

export const SETTINGS_COLUMNS =
  "time_zone, home_address, travel_mode, travel_buffer_minutes, time_format, day_start_hour, day_end_hour";

export function toSettingsData(row: SettingsRow): SettingsData {
  return {
    timeZone: row.time_zone,
    homeAddress: row.home_address ?? "",
    travelMode: row.travel_mode,
    travelBufferMinutes: row.travel_buffer_minutes,
    timeFormat: row.time_format,
    dayStartHour: row.day_start_hour,
    dayEndHour: row.day_end_hour,
  };
}

/** The whole settings row as the settings page shows it. */
export async function readSettings(query: Query): Promise<SettingsData> {
  const [row] = await query<SettingsRow>(`select ${SETTINGS_COLUMNS} from app.settings`);
  if (!row) {
    return { timeZone: DEFAULT_TIME_ZONE, homeAddress: "", travelMode: "driving", travelBufferMinutes: 10, ...DEFAULT_DISPLAY };
  }
  return toSettingsData(row);
}

/** How times and dates are shown: time format and visible hours. */
export async function readDisplay(query: Query): Promise<Display> {
  const { timeFormat, dayStartHour, dayEndHour } = await readSettings(query);
  return { timeFormat, dayStartHour, dayEndHour };
}

/** The view the calendar opens with when the address names none (spec 14); the week when unset. */
export async function readDefaultView(query: Query): Promise<View> {
  const [row] = await query<{ default_view: string }>("select default_view from app.settings");
  return isView(row?.default_view) ? row.default_view : "week";
}
