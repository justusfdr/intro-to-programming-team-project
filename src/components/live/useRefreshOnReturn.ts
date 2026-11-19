"use client";

// Spec 54 (changed 19 Nov 2026): calls `refresh` when the window gets the focus back or the tab becomes
// visible again, at most once every 10 seconds (./refresh-on-return.ts), counted from the page's load.
// The calendar passes live.refresh (re-reads the server page in the background, keeps the client's
// state); the People page passes router.refresh. Shared calendars re-read on focus by themselves
// (src/components/calendar/useSharedCalendars.ts).
import { useEffect } from "react";
import { shouldRefresh } from "./refresh-on-return";

export function useRefreshOnReturn(refresh: () => void): void {
  useEffect(() => {
    let lastAt = Date.now();
    const onReturn = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (!shouldRefresh(lastAt, now)) return;
      lastAt = now;
      refresh();
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refresh]);
}
