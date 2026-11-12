import "server-only";

// Reading event rows: the columns every query returns, and how a row becomes what the page gets.
import type { EventDto, EventSource, EventStatus } from "@/lib/events/types";

/** The columns to select (or return) for an event. Use it in every query that hands an event out. */
export const EVENT_COLUMNS =
  "id, title, start_at, end_at, all_day, first_day::text as first_day, last_day::text as last_day, may_overlap, status, goal_id, series_id, source, location, outlook_id is not null as in_outlook, updated_at";

export type EventRow = {
  id: string;
  title: string;
  /** Empty for an all-day event. */
  start_at: Date | null;
  end_at: Date | null;
  all_day: boolean;
  /** Only for an all-day event, "2026-11-16". */
  first_day: string | null;
  last_day: string | null;
  may_overlap: boolean;
  status: EventStatus;
  goal_id: string | null;
  series_id: string | null;
  source: EventSource;
  location: string | null;
  /** Outlook has a copy (app events) or it came from there (Outlook events). */
  in_outlook: boolean;
  updated_at: Date;
};

const iso = (value: Date | null) => (value ? new Date(value).toISOString() : null);

export function toEventDto(row: EventRow): EventDto {
  return {
    id: row.id,
    title: row.title,
    allDay: row.all_day,
    startAt: iso(row.start_at),
    endAt: iso(row.end_at),
    firstDay: row.first_day,
    lastDay: row.last_day,
    mayOverlap: row.may_overlap,
    status: row.status,
    goalId: row.goal_id,
    seriesId: row.series_id,
    source: row.source,
    location: row.location,
    notSent: false,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
