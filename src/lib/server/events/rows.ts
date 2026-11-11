import "server-only";

// Reading event rows: the columns every query returns, and how a row becomes what the page gets.
import type { EventDto, EventStatus } from "@/lib/events/types";

/** The columns to select (or return) for an event. Use it in every query that hands an event out. */
export const EVENT_COLUMNS = "id, title, start_at, end_at, may_overlap, status, updated_at";

export type EventRow = {
  id: string;
  title: string;
  start_at: Date;
  end_at: Date;
  may_overlap: boolean;
  status: EventStatus;
  updated_at: Date;
};

export function toEventDto(row: EventRow): EventDto {
  return {
    id: row.id,
    title: row.title,
    startAt: new Date(row.start_at).toISOString(),
    endAt: new Date(row.end_at).toISOString(),
    mayOverlap: row.may_overlap,
    status: row.status,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
