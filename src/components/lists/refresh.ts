"use client";

// Changes by other people appear without a manual reload (spec 30): the page is read again when the
// window gets the focus back, when the tab becomes visible again, and every 20 seconds while it is
// visible. It uses the app's way of re-reading a page (router.refresh() through Live, which keeps what
// is on screen until the new data has arrived). A hidden tab asks nothing.
import { useEffect, useSyncExternalStore } from "react";

export const REFRESH_MS = 20_000;

export function useRefreshWhileVisible(refresh: () => void, every = REFRESH_MS): void {
  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (visible()) refresh();
    };
    const timer = window.setInterval(() => {
      if (visible()) refresh();
    }, every);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, every]);
}

// "Hide done", remembered in this browser for every list (as the folded sidebar is).
export const HIDE_DONE_KEY = "lockedin:lists-hide-done:v1";
const CHANGED = "lockedin:lists-hide-done-changed";
/** Used when the browser blocks storage: the choice then lasts until the page reloads. */
let inMemory = false;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function readHideDone(): boolean {
  try {
    const stored = window.localStorage.getItem(HIDE_DONE_KEY);
    return stored === null ? inMemory : stored === "1";
  } catch {
    return inMemory;
  }
}

/** Whether done entries are hidden, and the switch. The server and the first render show them. */
export function useHideDone(): [boolean, (next: boolean) => void] {
  const hidden = useSyncExternalStore(subscribe, readHideDone, () => false);
  const set = (next: boolean) => {
    inMemory = next;
    try {
      window.localStorage.setItem(HIDE_DONE_KEY, next ? "1" : "0");
    } catch {
      // Storage blocked or full: the choice is kept in memory only.
    }
    window.dispatchEvent(new Event(CHANGED));
  };
  return [hidden, set];
}
