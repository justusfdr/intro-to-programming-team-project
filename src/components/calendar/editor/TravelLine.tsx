"use client";

// The travel line under the location (R27): "Leave at 9:25am", with how long the trip takes and the buffer.
// It is asked from the server (travel_time) when the editor opens and after each save; nothing is saved.
// The answers it can show: the time to leave; "Add your home address in settings"; "Address not found";
// "Travel time not available". Changes that are not saved yet do not count until Save.
// The OpenStreetMap credit the data licence asks for is shown once, in the settings' Travel card.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Navigation } from "lucide-react";
import { useDisplay } from "@/components/shell/DisplayProvider";
import type { TravelMode } from "@/lib/settings/types";
import { fmtMinutes, fmtTime } from "@/lib/time/display";
import { localTimeOf } from "@/lib/time/zoned";
import type { TravelAnswer } from "@/lib/travel/types";


const BY: Record<TravelMode, string> = { driving: "by car", cycling: "by bike", walking: "on foot", transit: "by public transport" };

type Props = {
  eventId: string;
  /** The saved event's updated_at: a new value (after a save) asks again. */
  savedAt: string;
  timeZone: string;
  /** The location and the way of getting there differ from the saved ones (not saved yet). */
  unsaved: boolean;
};

/** The line as text, for the screen and the tests. */
export function travelText(travel: TravelAnswer, timeZone: string, format: "12h" | "24h"): { main: string; detail: string | null } {
  if (travel.status !== "ok") return { main: travel.message, detail: null };
  const leave = fmtTime(localTimeOf(new Date(travel.leaveAt), timeZone), format);
  const buffer = travel.bufferMinutes > 0 ? ` + ${fmtMinutes(travel.bufferMinutes)} buffer` : "";
  return { main: `Leave at ${leave}`, detail: `${fmtMinutes(travel.minutes)} ${BY[travel.mode]}${buffer}` };
}

export function TravelLine({ eventId, savedAt, timeZone, unsaved }: Props) {
  const { timeFormat } = useDisplay();
  const [answer, setAnswer] = useState<{ for: string; travel: TravelAnswer | null; failed: boolean } | null>(null);
  const key = `${eventId}@${savedAt}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/events/${eventId}/travel`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { travel: TravelAnswer | null };
        setAnswer({ for: key, travel: body.travel, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setAnswer({ for: key, travel: null, failed: true });
      });
    return () => controller.abort();
  }, [eventId, key]);

  const current = answer?.for === key ? answer : null;
  if (current && !current.failed && current.travel === null) return null;

  return <TravelLineView travel={current ? (current.failed ? "failed" : current.travel) : "loading"} timeZone={timeZone} timeFormat={timeFormat} unsaved={unsaved} />;
}

/** What the line shows, without the asking (also drawn on its own in the tests). */
export function TravelLineView({
  travel,
  timeZone,
  timeFormat,
  unsaved,
}: {
  travel: TravelAnswer | null | "loading" | "failed";
  timeZone: string;
  timeFormat: "12h" | "24h";
  unsaved: boolean;
}) {
  if (travel === null) return null;
  const text =
    travel === "loading"
      ? { main: "Working out the travel time…", detail: null }
      : travel === "failed"
        ? { main: "Travel time not available", detail: null }
        : travelText(travel, timeZone, timeFormat);
  const ok = typeof travel === "object" && travel.status === "ok";

  return (
    <div role="status" className="flex flex-col gap-0.5 rounded-lg bg-raised px-3 py-2">
      <p className={`flex items-center gap-2 text-sm ${ok ? "font-medium text-ink" : "text-ink-2"}`}>
        <Navigation aria-hidden className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.8} />
        <span>{text.main}</span>
        {typeof travel === "object" && travel.status === "no_home" && (
          <Link href="/settings" className="text-xs font-normal text-ink-2 underline underline-offset-2 hover:text-ink">
            Settings
          </Link>
        )}
      </p>
      {text.detail && <p className="pl-5.5 text-xs text-ink-2">{text.detail}</p>}
      {unsaved && <p className="pl-5.5 text-xs text-ink-3">Save to update the travel time.</p>}
    </div>
  );
}
