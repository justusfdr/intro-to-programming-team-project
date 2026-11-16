// What travel_time (R27) answers about one event, shared by the server and the editor's travel line.
import type { TravelMode } from "@/lib/settings/types";

export type TravelAnswer =
  | {
      status: "ok";
      mode: TravelMode;
      minutes: number;
      bufferMinutes: number;
      leaveAt: string;
      /** The address of Google's map of the way (only for one event, and only when the server has a browser key). */
      map?: string;
    }
  | { status: "no_home" | "not_found" | "unavailable"; mode: TravelMode; message: string };
