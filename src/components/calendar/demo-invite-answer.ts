"use client";

// Spec 36: the answer to the one made-up invitation from the demo contact Lea, kept in this browser only
// (localStorage; nothing is sent, and a private window simply forgets it). Only one of the three answers
// is ever stored, under one fixed key. React reads it as an outside store (as the sidebar's choice).
import { useSyncExternalStore } from "react";
import { GIVEN_ANSWERS, type GivenAnswer } from "@/lib/invites/types";

const KEY = "lockedin.demoInviteAnswer";
const CHANGED = "lockedin:demo-invite-answer";
/** Used when the browser blocks storage: the answer then lasts until the page reloads. */
let inMemory: string | null = null;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? inMemory;
  } catch {
    return inMemory;
  }
}

/** The stored answer, or null (also on the server and in the first render). */
export function useDemoAnswer(): GivenAnswer | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return raw && (GIVEN_ANSWERS as readonly string[]).includes(raw) ? (raw as GivenAnswer) : null;
}

export function storeDemoAnswer(answer: GivenAnswer): void {
  inMemory = answer;
  try {
    window.localStorage.setItem(KEY, answer);
  } catch {
    // No storage (private window): kept in memory only.
  }
  window.dispatchEvent(new Event(CHANGED));
}
