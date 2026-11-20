import "server-only";

// Reading the signed-in user's saved places inside withUser (row-level security returns only theirs).
import type { SavedPlace } from "@/lib/places/saved";
import type { Query } from "../db";

/** A place's columns as a SavedPlace. */
export const PLACE_COLUMNS = `id, name, address, travel_mode as "travelMode", travel_buffer_minutes as "bufferMinutes"`;

export async function readPlaces(query: Query): Promise<SavedPlace[]> {
  return query<SavedPlace>(`select ${PLACE_COLUMNS} from app.places order by created_at, name`);
}
