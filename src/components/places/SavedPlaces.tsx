"use client";

// The user's saved places for the event editor (where a trip starts), handed down from the page.
import { createContext, useContext, type ReactNode } from "react";
import type { SavedPlace } from "@/lib/places/saved";

const SavedPlacesContext = createContext<SavedPlace[]>([]);

export function SavedPlacesProvider({ places, children }: { places: SavedPlace[]; children: ReactNode }) {
  return <SavedPlacesContext.Provider value={places}>{children}</SavedPlacesContext.Provider>;
}

/** The saved places, or none outside the calendar page. */
export function useSavedPlaces(): SavedPlace[] {
  return useContext(SavedPlacesContext);
}
