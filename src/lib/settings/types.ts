// The settings as the server sends them to the settings page (ontology section 3, settings).
import type { View } from "@/lib/events/views";
import type { TimeFormat } from "@/lib/time/display";

export type TravelMode = "driving" | "cycling" | "walking" | "transit";

export type SettingsData = {
  timeZone: string;
  /** Empty when not set. */
  homeAddress: string;
  travelMode: TravelMode;
  travelBufferMinutes: number;
  timeFormat: TimeFormat;
  /** First visible hour of the calendar, 0 to 23. */
  dayStartHour: number;
  /** End of the visible hours, 1 to 24, after the first. */
  dayEndHour: number;
};

/** Everything the settings page needs from the server. */
export type SettingsPageData = {
  settings: SettingsData;
  plan: "free" | "pro";
  /** The server has a Microsoft app registration and the key (docs/setup.md section 9). */
  outlookAvailable: boolean;
  outlook: { status: "none" | "connected" | "needs_reconnect"; lastSyncedAt: string | null };
  /** Today in the user's time zone, for "Last synced …". */
  today: string;
  /** The account still has rows from "Explore the demo" (spec 13): offer "Remove the demo data". */
  hasDemo: boolean;
  /** The view the calendar opens with (spec 14). */
  defaultView: View;
};
