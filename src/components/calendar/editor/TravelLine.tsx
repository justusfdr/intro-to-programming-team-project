"use client";

// The travel line under the location (R27): "Leave at 9:25am", with how long the trip takes and the buffer.
// It is asked from the server (travel_time) when the editor opens, after each save, and while the route
// is being changed (where from, the way, the address), before Save: then the changed values go with the
// question, count for the answer only and are not saved. A typed address waits a moment, so not every
// key press asks Google. The answers it can show: the time to leave; "Add your home address in settings";
// "Address not found"; "Travel time not available".
// With a time to leave, "Show map" opens Google's map of the way (only then is Google asked for it).
// The "Google Maps" credit is shown in the settings' Travel card.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Navigation } from "lucide-react";
import { useDisplay } from "@/components/shell/DisplayProvider";
import type { TravelMode } from "@/lib/settings/types";
import { fmtMinutes, fmtTime } from "@/lib/time/display";
import { localTimeOf } from "@/lib/time/zoned";
import type { TravelAnswer } from "@/lib/travel/types";


const BY: Record<TravelMode, string> = { driving: "by car", cycling: "by bike", walking: "on foot", transit: "by public transport" };

/** The route as the editor shows it now, also when it is not saved yet. */
export type RoutePreview = { location: string; mode: TravelMode | null; from: string | null };

/** How long a changed route waits before it is asked about. */
const TYPING_PAUSE_MS = 400;

type Props = {
  eventId: string;
  /** The saved event's updated_at: a new value (after a save) asks again. */
  savedAt: string;
  timeZone: string;
  /** The route in the editor; left out for events whose route cannot be changed here (Outlook). */
  route?: RoutePreview;
};

/** The question's address: the event's travel answer, with the route as it is in the editor. */
export function travelUrl(eventId: string, route?: RoutePreview): string {
  if (!route) return `/api/events/${eventId}/travel`;
  const params = new URLSearchParams({ location: route.location, mode: route.mode ?? "", from: route.from ?? "" });
  return `/api/events/${eventId}/travel?${params.toString()}`;
}

/** The line as text, for the screen and the tests. */
export function travelText(travel: TravelAnswer, timeZone: string, format: "12h" | "24h"): { main: string; detail: string | null } {
  if (travel.status !== "ok") return { main: travel.message, detail: null };
  const leave = fmtTime(localTimeOf(new Date(travel.leaveAt), timeZone), format);
  const buffer = travel.bufferMinutes > 0 ? ` + ${fmtMinutes(travel.bufferMinutes)} buffer` : "";
  const from = travel.from ? ` from ${travel.from}` : "";
  return { main: `Leave at ${leave}`, detail: `${fmtMinutes(travel.minutes)} ${BY[travel.mode]}${from}${buffer}` };
}

export function TravelLine({ eventId, savedAt, timeZone, route }: Props) {
  const { timeFormat } = useDisplay();
  const [answer, setAnswer] = useState<{ for: string; travel: TravelAnswer | null; failed: boolean } | null>(null);
  // A changed route is asked about after a short pause, so typing an address does not ask at every key.
  const wanted = travelUrl(eventId, route);
  const [url, setUrl] = useState(wanted);
  useEffect(() => {
    if (wanted === url) return;
    const timer = setTimeout(() => setUrl(wanted), TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [wanted, url]);
  const key = `${url}@${savedAt}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { travel: TravelAnswer | null };
        setAnswer({ for: key, travel: body.travel, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setAnswer({ for: key, travel: null, failed: true });
      });
    return () => controller.abort();
  }, [url, key]);

  // While a new answer is on its way, the last one stays (it does not flicker to "Working out…").
  const current = answer;
  if (current && !current.failed && current.travel === null) return null;

  return <TravelLineView travel={current ? (current.failed ? "failed" : current.travel) : "loading"} timeZone={timeZone} timeFormat={timeFormat} />;
}

/** What the line shows, without the asking (also drawn on its own in the tests). */
export function TravelLineView({
  travel,
  timeZone,
  timeFormat,
  unsaved = false,
}: {
  travel: TravelAnswer | null | "loading" | "failed";
  timeZone: string;
  timeFormat: "12h" | "24h";
  /** Only for a line that cannot ask with the editor's route; the editor's own line always can. */
  unsaved?: boolean;
}) {
  if (travel === null) return null;
  const text =
    travel === "loading"
      ? { main: "Working out the travel time…", detail: null }
      : travel === "failed"
        ? { main: "Travel time not available", detail: null }
        : travelText(travel, timeZone, timeFormat);
  const ok = typeof travel === "object" && travel.status === "ok";
  const map = typeof travel === "object" && travel.status === "ok" ? travel.map : undefined;

  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-raised px-3 py-2">
      <div role="status" className="flex flex-col gap-0.5">
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
      {map && <RouteMap src={map} />}
    </div>
  );
}

/** "Show map": Google's map of the way in a frame, loaded only when it is opened. */
function RouteMap({ src }: { src: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pl-5.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-ink-2 underline underline-offset-2 hover:text-ink"
      >
        {open ? "Hide map" : "Show map"}
      </button>
      {open && (
        <iframe
          title="Map of the way there"
          src={src}
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="mt-2 h-56 w-full rounded-md border border-line"
        />
      )}
    </div>
  );
}
