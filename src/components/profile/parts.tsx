"use client";

// Small pieces of the profile pages (spec 40; spec 53: another person's page too): the time-zone line
// with the current local time there, and the LinkedIn link.
import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { isLinkedInUrl } from "@/lib/profiles/linkedin";
import { fmtTime } from "@/lib/time/display";
import { localTimeOf } from "@/lib/time/zoned";

/**
 * The LinkedIn link, with the word "LinkedIn" (never the raw address), in a new tab without telling
 * LinkedIn where it came from. Rendered only when the address passes the stored form once more, so no
 * other scheme or host can ever become a link here.
 */
export function LinkedInLink({ url }: { url: string | null }) {
  if (!isLinkedInUrl(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 text-sm font-medium text-ink underline underline-offset-2"
    >
      LinkedIn
      <ExternalLink className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * The current time, starting from the minute the server read the page (so server and browser render
 * the same) and then following the clock, once a minute.
 */
export function useMinuteClock(now: string): Date {
  const [at, setAt] = useState(() => new Date(now));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = new Date();
      setAt(current);
      // Again at the start of the next minute.
      timer = setTimeout(tick, 60_000 - (current.getTime() % 60_000) + 50);
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, []);
  return at;
}

/** "America/New_York" → "America/New York". */
const zoneName = (zone: string) => zone.replaceAll("_", " ");

/** The local time in `timeZone` at `at`, in the user's time format; null for a zone the browser does not know. */
function clockIn(at: Date, timeZone: string, format: "12h" | "24h"): string | null {
  try {
    return fmtTime(localTimeOf(at, timeZone), format);
  } catch {
    return null;
  }
}

/**
 * "Time zone: Europe/Lisbon · it is 2:20pm there", read only. Starts from the minute the server read the
 * page (so server and browser show the same) and then follows the clock. `settingsLink`: the user's own
 * zone, with the way to change it in Settings (another person's page leaves it out, spec 53).
 */
export function TimeZoneLine({ timeZone, now, settingsLink = true }: { timeZone: string; now: string; settingsLink?: boolean }) {
  const { timeFormat } = useDisplay();
  const at = useMinuteClock(now);
  const clock = clockIn(at, timeZone, timeFormat);
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-2">
      <Globe className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden="true" />
      <span>
        Time zone: <span className="font-medium text-ink">{zoneName(timeZone)}</span>
        {clock && <> · it is <time className="tabular">{clock}</time> there</>}
      </span>
      {settingsLink && (
        <Link href="/settings" className="font-medium text-ink underline underline-offset-2">
          Change in Settings
        </Link>
      )}
    </p>
  );
}
