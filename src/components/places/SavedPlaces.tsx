"use client";

// The user's saved places for the event editor (where a trip starts, and the first suggestions for an
// event's location), handed down from the page. A place saved from the editor ("Save as place") is added
// here at once, so it can be chosen without reloading the page.
import { createContext, useContext, useState, type ReactNode } from "react";
import type { SavedPlace } from "@/lib/places/saved";
import type { PlaceSuggestion } from "@/lib/places/places";
import type { TravelMode } from "@/lib/settings/types";

type Value = { places: SavedPlace[]; add: (place: SavedPlace) => void; home: string; travelMode: TravelMode };

const SavedPlacesContext = createContext<Value>({ places: [], add: () => {}, home: "", travelMode: "driving" });

export function SavedPlacesProvider({
  places: initial,
  home = "",
  travelMode = "driving",
  children,
}: {
  places: SavedPlace[];
  /** The home address from the settings (empty when not set). */
  home?: string;
  /** The way of getting there from the settings (the default). */
  travelMode?: TravelMode;
  children: ReactNode;
}) {
  const [places, setPlaces] = useState(initial);
  const add = (place: SavedPlace) => setPlaces((list) => [...list.filter((p) => p.id !== place.id), place]);
  return <SavedPlacesContext.Provider value={{ places, add, home, travelMode }}>{children}</SavedPlacesContext.Provider>;
}

/** The home address and the default way of getting there, from the settings. */
export function useTravelDefaults(): { home: string; travelMode: TravelMode } {
  const { home, travelMode } = useContext(SavedPlacesContext);
  return { home, travelMode };
}

/** The saved places, or none outside the calendar page. */
export function useSavedPlaces(): SavedPlace[] {
  return useContext(SavedPlacesContext).places;
}

/** Adds a place saved from the editor to the list. */
export function useAddSavedPlace(): (place: SavedPlace) => void {
  return useContext(SavedPlacesContext).add;
}

/** The saved places whose name starts with what is typed (any case), as suggestions: their addresses. */
export function savedMatches(typed: string, places: SavedPlace[]): PlaceSuggestion[] {
  const text = typed.trim().toLowerCase();
  if (text === "") return [];
  return places.filter((p) => p.name.toLowerCase().startsWith(text)).map((p) => ({ label: p.address }));
}

/** The saved places that fit first, then the search's suggestions, each address once. */
export function withSaved(typed: string, places: SavedPlace[], found: PlaceSuggestion[]): PlaceSuggestion[] {
  const saved = savedMatches(typed, places);
  return [...saved, ...found.filter((f) => !saved.some((s) => s.label === f.label))];
}
