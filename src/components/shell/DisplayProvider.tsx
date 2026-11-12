"use client";

// Hands the user's display settings (time format, visible hours) to every component below the shell.
// Without a provider (tests, previews) the prototype's defaults apply: 12-hour times, 7 am to 9 pm.
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_DISPLAY, type Display } from "@/lib/time/display";

const DisplayContext = createContext<Display>(DEFAULT_DISPLAY);

export function DisplayProvider({ value, children }: { value: Display; children: ReactNode }) {
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplay(): Display {
  return useContext(DisplayContext);
}
