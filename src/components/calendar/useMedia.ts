"use client";

// A media query as a React value, copied from the first prototype. On the server (and in the first
// render) it is false; the calendar's markup is built so that this first paint already fits phones.
import { useCallback, useSyncExternalStore } from "react";

/** Tailwind's breakpoints as media queries. */
export const MEDIA = {
  phone: "(max-width: 47.99rem)", // below md
} as const;

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
