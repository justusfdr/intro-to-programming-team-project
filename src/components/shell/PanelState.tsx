"use client";

// Which side panels are open (README, interface notes: panels beside the calendar can be collapsed
// and expanded). On wide screens a panel sits beside the calendar and collapses; on smaller screens
// it opens as a sheet over the page. The choice for wide screens is remembered in this browser only.
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";

type PanelName = "goals";

type PanelControls = {
  /** Open beside the calendar (wide screens). */
  isOpen: (panel: PanelName) => boolean;
  toggle: (panel: PanelName) => void;
  /** Open as a sheet (smaller screens). */
  sheet: PanelName | null;
  openSheet: (panel: PanelName | null) => void;
};

const STORAGE_KEY = "lock-in.collapsed-panels";
const CHANGED = "lock-in:panels-changed";

const PanelContext = createContext<PanelControls>({
  isOpen: () => true,
  toggle: () => {},
  sheet: null,
  openSheet: () => {},
});

// The collapsed panels live in localStorage; React reads them as an outside store.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function readStored(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]"; // no storage (private window): panels start open
  }
}

function parse(stored: string): PanelName[] {
  try {
    const value: unknown = JSON.parse(stored);
    return Array.isArray(value) ? value.filter((p): p is PanelName => p === "goals") : [];
  } catch {
    return [];
  }
}

export function PanelState({ children }: { children: ReactNode }) {
  // On the server (and in the first render) every panel is open.
  const collapsed = parse(useSyncExternalStore(subscribe, readStored, () => "[]"));
  const [sheet, openSheet] = useState<PanelName | null>(null);

  function toggle(panel: PanelName) {
    const next = collapsed.includes(panel) ? collapsed.filter((p) => p !== panel) : [...collapsed, panel];
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Without storage the panel stays as it is (very rare: storage switched off).
    }
    window.dispatchEvent(new Event(CHANGED));
  }

  return (
    <PanelContext value={{ isOpen: (panel) => !collapsed.includes(panel), toggle, sheet, openSheet }}>
      {children}
    </PanelContext>
  );
}

export function usePanels(): PanelControls {
  return useContext(PanelContext);
}
