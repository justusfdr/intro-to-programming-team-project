// The first step typed into "Before you start" on the Focus page (spec 47). It stays in this
// browser tab only (sessionStorage): it is shown under the timer while the session runs and
// removed when the session ends. Nothing here is sent to the server or saved in the account.
import { useSyncExternalStore } from "react";

const KEY = "lockedin:first-step";
/** As long as an event's title may be. */
export const FIRST_STEP_MAX = 200;

/** What is kept of a typed first step: no line breaks, at most FIRST_STEP_MAX characters. */
export function cleanFirstStep(text: string): string {
  return text.replace(/\s+/g, " ").trimStart().slice(0, FIRST_STEP_MAX);
}

// The browser may refuse sessionStorage (some private windows). Then the step lives here, for
// as long as the page is open.
let memory = "";
const listeners = new Set<() => void>();

/** The first step as it stands now. Outside a browser there is no tab to keep it in: only this page's memory. */
export function readFirstStep(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function saveFirstStep(text: string): void {
  memory = cleanFirstStep(text);
  try {
    if (memory) window.sessionStorage.setItem(KEY, memory);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Kept in `memory` only.
  }
  for (const listener of listeners) listener();
}

export function clearFirstStep(): void {
  saveFirstStep("");
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The first step typed in this tab, or "". On the server and before the page is live it is "". */
export function useFirstStep(): string {
  return useSyncExternalStore(subscribe, readFirstStep, () => "");
}
