import "server-only";

// Reading the signed-in user's saved places inside withUser (row-level security returns only theirs).
import type { SavedPlace } from "@/lib/places/saved";
import type { Query } from "../db";

export async function readPlaces(query: Query): Promise<SavedPlace[]> {
  return query<SavedPlace>("select id, name, address from app.places order by created_at, name");
}
