import "server-only";

// Reading the signed-in user's settings inside withUser.
import type { Query } from "./db";
import { DEFAULT_TIME_ZONE } from "./validation";

/** The user's time zone from app.settings (row-level security returns only their own row). */
export async function readTimeZone(query: Query): Promise<string> {
  const [row] = await query<{ time_zone: string }>("select time_zone from app.settings");
  return row?.time_zone ?? DEFAULT_TIME_ZONE;
}
