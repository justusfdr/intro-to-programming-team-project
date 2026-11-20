import "server-only";

// Action update_settings (ontology section 5; spec 12). Same pattern as the other actions:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body (only the fields that change)
//   4. inside withUser: merge with the saved row, check every rule with its message, write
//   5. one answer per outcome. The database checks the travel mode, the buffer, the time format, the
//      visible hours and the default view again, and lets a user change only their own row and only these columns.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readSettings, SETTINGS_COLUMNS, toSettingsData } from "@/lib/server/settings";

const MAX_ADDRESS = 200;

const SettingsBody = z
  .strictObject({
    timeZone: z.string().max(100),
    homeAddress: z.string().max(2000),
    travelMode: z.enum(["driving", "cycling", "walking", "transit"]),
    travelBufferMinutes: z.number(),
    // How the user gets home and the buffer for it; null is "as Other" (travelMode, travelBufferMinutes).
    homeTravelMode: z.enum(["driving", "cycling", "walking", "transit"]).nullable(),
    homeTravelBufferMinutes: z.number().nullable(),
    timeFormat: z.enum(["12h", "24h"]),
    dayStartHour: z.number(),
    dayEndHour: z.number(),
    // Spec 14: the view the calendar opens with when the address names none.
    defaultView: z.enum(["day", "week", "month"]),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0);

/** The canonical name of a time zone the server knows ("europe/lisbon" → "Europe/Lisbon"), or null. */
export function knownTimeZone(raw: string): string | null {
  const name = raw.trim();
  if (!name || name.length > 64) return null;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function updateSettings(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, SettingsBody);
    if (!body.ok) return body.response;
    const patch = body.data;

    let timeZone: string | undefined;
    if (patch.timeZone !== undefined) {
      timeZone = knownTimeZone(patch.timeZone) ?? undefined;
      if (!timeZone) throw new ActionError(400, "unknown_time_zone", MESSAGES.unknownTimeZone);
    }

    let homeAddress: string | null | undefined;
    if (patch.homeAddress !== undefined) {
      const trimmed = patch.homeAddress.trim();
      if ([...trimmed].length > MAX_ADDRESS) throw new ActionError(400, "address_too_long", MESSAGES.addressTooLong);
      homeAddress = trimmed === "" ? null : trimmed;
    }

    const buffer = patch.travelBufferMinutes;
    if (buffer !== undefined && !(Number.isInteger(buffer) && buffer >= 0 && buffer <= 59)) {
      throw new ActionError(400, "buffer_range", MESSAGES.bufferRange);
    }
    const homeBuffer = patch.homeTravelBufferMinutes;
    if (homeBuffer !== undefined && homeBuffer !== null && !(Number.isInteger(homeBuffer) && homeBuffer >= 0 && homeBuffer <= 59)) {
      throw new ActionError(400, "buffer_range", MESSAGES.bufferRange);
    }

    return deps.withUser(userId, async (query) => {
      const saved = await readSettings(query);
      const from = patch.dayStartHour ?? saved.dayStartHour;
      const to = patch.dayEndHour ?? saved.dayEndHour;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 23 || to < 1 || to > 24 || to <= from) {
        throw new ActionError(400, "visible_hours", MESSAGES.visibleHours);
      }

      const [row] = await query<Parameters<typeof toSettingsData>[0]>(
        `update app.settings
            set time_zone = $1, home_address = $2, travel_mode = $3, travel_buffer_minutes = $4,
                time_format = $5, day_start_hour = $6, day_end_hour = $7,
                default_view = coalesce($9, default_view),
                home_travel_mode = $10, home_travel_buffer_minutes = $11
          where user_id = $8
          returning ${SETTINGS_COLUMNS}`,
        [
          timeZone ?? saved.timeZone,
          homeAddress === undefined ? saved.homeAddress || null : homeAddress,
          patch.travelMode ?? saved.travelMode,
          buffer ?? saved.travelBufferMinutes,
          patch.timeFormat ?? saved.timeFormat,
          from,
          to,
          userId,
          patch.defaultView ?? null,
          patch.homeTravelMode === undefined ? saved.homeTravelMode : patch.homeTravelMode,
          homeBuffer === undefined ? saved.homeTravelBufferMinutes : homeBuffer,
        ],
      );
      return jsonOk({ message: MESSAGES.settingsSaved, settings: toSettingsData(row) });
    });
  });
}
