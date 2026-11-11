"use client";

// Placeholder for task E2 (delete_event: a Delete button with a confirmation).
// The week view already renders it for every event, so the task only fills this file in.
import type { WeekEvent } from "@/lib/events/types";

export function DeleteEvent({ event }: { event: WeekEvent }) {
  void event;
  return null;
}
