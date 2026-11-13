// What travel_time (R27) answers about one event, shared by the server and the editor's travel line.
import type { TravelMode } from "@/lib/settings/types";

export type TravelAnswer =
  | { status: "ok"; mode: TravelMode; minutes: number; bufferMinutes: number; leaveAt: string }
  | { status: "no_home" | "not_found" | "unavailable"; mode: TravelMode; message: string };
