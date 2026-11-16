"use client";

// The travel answers (R27) for the events the calendar shows, asked in one go (travel_times) whenever the
// shown events change. Only events that can have a travel time are asked for (timed, with a location that
// is not a web link). Nothing is saved; the server reuses results for up to 6 hours.
import { useEffect, useMemo, useState } from "react";
import { postJson } from "@/lib/client/post-json";
import type { WeekEvent } from "@/lib/events/types";
import type { TravelAnswer } from "@/lib/travel/types";
import { canTravel } from "@/lib/travel/web-link";

/** What an event's travel time depends on: when it changes, its old answer no longer fits. */
const versionOf = (e: WeekEvent) => `${e.updatedAt}@${e.startAt}@${e.location}@${e.travelMode ?? ""}@${e.travelFrom ?? ""}`;

type Answers = Record<string, { version: string; travel: TravelAnswer }>;

export function useTravelTimes(events: readonly WeekEvent[]): Readonly<Record<string, TravelAnswer>> {
  // What to ask for: each event once (an event past midnight is shown on two days).
  const wanted = useMemo(() => {
    const seen = new Map<string, WeekEvent>();
    for (const e of events) if (canTravel(e) && !seen.has(e.id)) seen.set(e.id, e);
    return [...seen.values()].slice(0, 100);
  }, [events]);
  const key = wanted.map((e) => `${e.id}@${versionOf(e)}`).join("|");

  const [answers, setAnswers] = useState<Answers>({});

  useEffect(() => {
    if (wanted.length === 0) return;
    let current = true;
    const asked = new Map(wanted.map((e) => [e.id, versionOf(e)]));
    void postJson("/api/travel", { ids: [...asked.keys()] }).then((answer) => {
      if (!current || !answer.ok) return;
      const travel = (answer.data as { travel?: Record<string, TravelAnswer> } | undefined)?.travel ?? {};
      const next: Answers = {};
      for (const [id, t] of Object.entries(travel)) {
        const version = asked.get(id);
        if (version) next[id] = { version, travel: t };
      }
      setAnswers(next);
    });
    return () => {
      current = false;
    };
    // `key` stands for `wanted`: it changes exactly when a new question is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Only answers that still fit the event as shown (a moved event waits for its new answer).
  return useMemo(() => {
    const fitting: Record<string, TravelAnswer> = {};
    for (const e of wanted) {
      const a = answers[e.id];
      if (a && a.version === versionOf(e)) fitting[e.id] = a.travel;
    }
    return fitting;
  }, [wanted, answers]);
}
