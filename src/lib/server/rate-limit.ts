import "server-only";

// A small rate limit: how often each key (a user, an e-mail address, a client address) did something
// within a sliding window, kept in this server's memory only. The map is pruned and bounded, so many
// keys cannot fill the memory. Used by search_places and by the account actions.
//
// Honest limit: on a serverless host every instance has its own memory, and a new instance starts at
// zero. This slows abuse down; it is not a hard guarantee.

export type Limiter = {
  /** True when the key has done it fewer times than allowed within the window. Counts nothing. */
  allows(key: string, now: number): boolean;
  /** Counts one more time for the key. */
  count(key: string, now: number): void;
};

export function createLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }): Limiter {
  /** The times within the window per key. Least recently active first. */
  const recent = new Map<string, number[]>();
  const within = (key: string, now: number) => (recent.get(key) ?? []).filter((at) => now - at < windowMs);

  return {
    allows: (key, now) => within(key, now).length < limit,
    count(key, now) {
      const times = within(key, now);
      times.push(now);
      // Delete and set again, so the map stays in order of last activity.
      recent.delete(key);
      recent.set(key, times);
      if (recent.size > maxKeys) {
        for (const [other, list] of recent) if (list.every((at) => now - at >= windowMs)) recent.delete(other);
        // Still too many active keys: forget the least recently active ones.
        while (recent.size > maxKeys) recent.delete(recent.keys().next().value!);
      }
    },
  };
}

/** Counts one time for every limiter when all of them allow it; else counts nothing and answers false. */
export function takeAll(checks: ReadonlyArray<readonly [Limiter, string]>, now: number): boolean {
  if (!checks.every(([limiter, key]) => limiter.allows(key, now))) return false;
  for (const [limiter, key] of checks) limiter.count(key, now);
  return true;
}
