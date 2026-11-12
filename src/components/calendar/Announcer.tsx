"use client";

// One place on the calendar that announces what an action did ("Event saved.", "Event deleted.").
// It sits outside the event grid on purpose: after a delete or a move to another day the event's own
// element disappears with router.refresh(), and a message inside it would vanish before it is read.
// It shows as a small dark bar at the bottom (as in the prototype) and fades after a few seconds.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const AnnounceContext = createContext<(message: string) => void>(() => {});
const SHOWN_MS = 5000;

export function Announcer({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(""), SHOWN_MS);
    return () => window.clearTimeout(id);
  }, [message]);

  return (
    <AnnounceContext value={setMessage}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] md:bottom-4 flex justify-center px-4">
        <p
          role="status"
          className={
            message
              ? "rounded-full bg-ink px-4 py-2 text-sm text-white shadow-float transition-opacity"
              : "sr-only"
          }
        >
          {message}
        </p>
      </div>
    </AnnounceContext>
  );
}

/** Returns the function that shows and announces a message on the calendar. */
export function useAnnounce(): (message: string) => void {
  return useContext(AnnounceContext);
}
