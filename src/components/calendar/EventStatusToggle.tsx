"use client";

// Placeholder for task E3 (mark_event_done and mark_event_planned: a Done / Not done button).
// The week view already renders it for every event, so the task only fills this file in.
import type { WeekEvent } from "@/lib/events/types";

export function EventStatusToggle({ event }: { event: WeekEvent }) {
  void event;
  return null;
}
