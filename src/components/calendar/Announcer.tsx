"use client";

// One place on the week page that announces what an action did ("Event saved.", "Event deleted.").
// It sits outside the event list on purpose: after a delete or a move to another day the event's own
// element disappears with router.refresh(), and a message inside it would vanish before it is read.
import { createContext, useContext, useState, type ReactNode } from "react";

const AnnounceContext = createContext<(message: string) => void>(() => {});

export function Announcer({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  return (
    <AnnounceContext value={setMessage}>
      <p
        role="status"
        className={message ? "mb-4 rounded-xl bg-success-soft px-3 py-2 text-sm text-success" : "sr-only"}
      >
        {message}
      </p>
      {children}
    </AnnounceContext>
  );
}

/** Returns the function that shows and announces a message on the week page. */
export function useAnnounce(): (message: string) => void {
  return useContext(AnnounceContext);
}
