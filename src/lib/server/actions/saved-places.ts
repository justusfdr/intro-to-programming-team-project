import "server-only";

// Actions add_place, edit_place, set_place_travel and remove_place: the user's saved places besides the home address
// ("Uni", "Gym"). Same pattern as add_blocked_site:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body (name and address trimmed)
//   4. inside withUser: write (the database checks the form, each name once and at most 10 again)
//   5. one answer per outcome. Another user's place or an unknown id is "Not found" (R3).
import { z } from "zod";
import { MAX_PLACE_ADDRESS, MAX_PLACE_NAME, MAX_PLACES, type SavedPlace } from "@/lib/places/saved";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { PLACE_COLUMNS } from "@/lib/server/places/saved";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PlaceBody = z.object({ name: z.string().max(1000), address: z.string().max(2000) });

/** The trimmed name and address, or the refusal. */
function checkPlace(body: { name: string; address: string }): { name: string; address: string } {
  const name = body.name.trim();
  const address = body.address.trim();
  if (name.length < 1 || [...name].length > MAX_PLACE_NAME) throw new ActionError(400, "invalid_name", MESSAGES.placeNeedsName);
  if (address.length < 1 || [...address].length > MAX_PLACE_ADDRESS) throw new ActionError(400, "invalid_address", MESSAGES.placeNeedsAddress);
  return { name, address };
}

/** The database's refusals as answers (two devices at the same moment). */
function refusal(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("places_once_per_user")) throw new ActionError(409, "name_taken", MESSAGES.placeNameTaken);
  if (message.includes("at most 10 places")) throw new ActionError(409, "too_many_places", MESSAGES.tooManyPlaces);
  throw error;
}

export function addPlace(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, PlaceBody);
    if (!body.ok) return body.response;
    const { name, address } = checkPlace(body.data);
    try {
      return await deps.withUser(userId, async (query) => {
        const [{ taken, count }] = await query<{ taken: boolean; count: number }>(
          "select bool_or(name = $1) is true as taken, count(*)::int as count from app.places",
          [name],
        );
        if (taken) throw new ActionError(409, "name_taken", MESSAGES.placeNameTaken);
        if (count >= MAX_PLACES) throw new ActionError(409, "too_many_places", MESSAGES.tooManyPlaces);
        const [place] = await query<SavedPlace>(`insert into app.places (name, address) values ($1, $2) returning ${PLACE_COLUMNS}`, [name, address]);
        return jsonOk({ message: MESSAGES.placeSaved, place }, 201);
      });
    } catch (error) {
      refusal(error);
    }
  });
}

export function editPlace(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, PlaceBody);
    if (!body.ok) return body.response;
    const { name, address } = checkPlace(body.data);
    if (!UUID.test(id)) throw notFound();
    try {
      return await deps.withUser(userId, async (query) => {
        const [taken] = await query("select 1 from app.places where name = $1 and id <> $2", [name, id]);
        if (taken) throw new ActionError(409, "name_taken", MESSAGES.placeNameTaken);
        const [place] = await query<SavedPlace>(`update app.places set name = $1, address = $2 where id = $3 returning ${PLACE_COLUMNS}`, [name, address, id]);
        if (!place) throw notFound();
        return jsonOk({ message: MESSAGES.placeSaved, place });
      });
    } catch (error) {
      refusal(error);
    }
  });
}

export function removePlace(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    return deps.withUser(userId, async (query) => {
      if (!UUID.test(id)) throw notFound();
      const deleted = await query("delete from app.places where id = $1 returning id", [id]);
      if (deleted.length === 0) throw notFound();
      return jsonOk({ message: MESSAGES.placeRemoved });
    });
  });
}

// How the user gets to this place and the buffer for it; null is "as Other" (the settings'). Only the
// fields sent change.
const TravelBody = z
  .strictObject({
    travelMode: z.enum(["driving", "cycling", "walking", "transit"]).nullable(),
    bufferMinutes: z.number().nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0);

export function setPlaceTravel(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, TravelBody);
    if (!body.ok) return body.response;
    const { travelMode, bufferMinutes } = body.data;
    if (bufferMinutes !== undefined && bufferMinutes !== null && !(Number.isInteger(bufferMinutes) && bufferMinutes >= 0 && bufferMinutes <= 59)) {
      throw new ActionError(400, "buffer_range", MESSAGES.bufferRange);
    }
    if (!UUID.test(id)) throw notFound();
    return deps.withUser(userId, async (query) => {
      const [place] = await query<SavedPlace>(
        `update app.places
            set travel_mode = case when $2 then $3 else travel_mode end,
                travel_buffer_minutes = case when $4 then $5::integer else travel_buffer_minutes end
          where id = $1
          returning ${PLACE_COLUMNS}`,
        [id, travelMode !== undefined, travelMode ?? null, bufferMinutes !== undefined, bufferMinutes ?? null],
      );
      if (!place) throw notFound();
      return jsonOk({ message: MESSAGES.placeSaved, place });
    });
  });
}
