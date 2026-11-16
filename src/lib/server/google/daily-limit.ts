import "server-only";

// Our own second brake on Google calls, next to the daily quotas in the Google Cloud Console
// (docs/setup.md, section 12): at most this many calls (places and routes together) per day (UTC).
// After that, address search and travel time say they are not available until the next day.
//
// Honest limit: like rate-limit.ts it lives in this server's memory, so on a serverless host every
// instance counts on its own and a new instance starts at zero. Google's quotas stay the real brake.
import { googleMapsDailyLimit } from "@/lib/server/config";

export type DailyCounter = {
  /** Counts one call and answers true, or answers false (and counts nothing) when today's calls are used up. */
  take(now: Date): boolean;
};

export function createDailyCounter(limit: number): DailyCounter {
  let day = "";
  let used = 0;
  return {
    take(now) {
      const today = now.toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        used = 0;
      }
      if (used >= limit) return false;
      used += 1;
      return true;
    },
  };
}

/** The one counter of this server, shared by places and routes. */
export const sharedDailyCounter: DailyCounter = createDailyCounter(googleMapsDailyLimit());
