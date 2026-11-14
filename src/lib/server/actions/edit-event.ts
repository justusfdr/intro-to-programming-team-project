import "server-only";

// Action edit_event (ontology section 5; specs 02 and 07). Same pattern as create_event:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: find the user's event ("Not found" otherwise, R3), check it has not changed
//      since the device last saw it (R4), check the rules, write   5. one answer per outcome.
// Status, source, user_id and series_id are never changed here (status only goes back to planned
// when a timed event becomes all-day, which can never be done, R29).
//
// The location (up to 200 characters, empty means none) is set through app.set_event_location, the travel
// mode (null: the standard from the settings) through app.set_event_travel_mode; left out of the body,
// each stays as it is.
//
// Scope (R28): "this" changes the one event. "this_and_following" changes this event and the later
// ones of its series in one transaction; every event keeps its own date and gets the new times.
// The two-device check is on the event the user opened; the whole change is one step (R4).
//
// Spec 24: the guests, when the body names them, are saved like the location: left out, they stay. A
// changed list needs a connected Outlook (it sends the invitations) and is refused on an event of a
// series, a demo event and an Outlook event (its attendees are Outlook's, R11). A list equal to the
// saved one changes nothing.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { sameGuests } from "@/lib/events/guests";
import { asGuestError, assertMayInvite, assertNotEnded, checkGuests } from "@/lib/server/events/guests";
import { checkEventFields, EventFields } from "@/lib/server/events/input";
import { assertUnchangedSince, findOwnEvent } from "@/lib/server/events/own-event";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "@/lib/server/events/rows";
import { templateOf, timesOn } from "@/lib/server/events/series";
import { assertOwnGoal } from "@/lib/server/goals/own-goal";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { localDateOf } from "@/lib/time/zoned";

/**
 * The edit form's fields, plus the updated_at the device last saw (R4) and the scope (R28). The title
 * is left out only for an Outlook event, whose editor sends just the goal (R11).
 */
const EditBody = EventFields.partial({ title: true }).extend({
  updatedAt: z.string().max(40),
  scope: z.enum(["this", "this_and_following"]).optional(),
});

/** Fields that Outlook owns for an imported event (R11). */
const OUTLOOK_FIELDS = ["title", "start", "end", "allDay", "firstDay", "lastDay", "mayOverlap", "location", "travelMode", "repeat", "guests"] as const;

const badRequest = () => new ActionError(400, "bad_request", MESSAGES.badRequest);

export function editEvent(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, EditBody);
    if (!body.ok) return body.response;

    // The database's refusal of guests (Outlook disconnected at the same moment) becomes the ontology's answer.
    const asAnswer = (error: unknown) => Promise.reject(asGuestError(error));
    return deps.withUser(userId, async (query) => {
      // Locks the row until the transaction ends, so a second device waits instead of racing.
      // The time zone is read in the same round (first: it has no parameter); an Outlook event does not need it.
      const [timeZone, row] = await Promise.all([readTimeZone(query), findOwnEvent(query, id)]);

      // R11: an Outlook event keeps its title, times, days and location from Outlook; only the goal changes here.
      if (row.source === "outlook") {
        if (OUTLOOK_FIELDS.some((field) => body.data[field] !== undefined)) {
          throw new ActionError(409, "outlook_event", MESSAGES.changeInOutlook);
        }
        assertUnchangedSince(row, body.data.updatedAt);
        if (body.data.goalId === undefined) throw badRequest();
        if (row.all_day && body.data.goalId) throw new ActionError(400, "all_day_goal", MESSAGES.allDayNoGoal);
        await assertOwnGoal(query, body.data.goalId);
        const [updated] = await query<EventRow>(
          `update app.events set goal_id = $2 where id = $1 returning ${EVENT_COLUMNS}`,
          [id, body.data.goalId],
        );
        return jsonOk({ message: MESSAGES.eventSaved, event: toEventDto(updated) });
      }

      assertUnchangedSince(row, body.data.updatedAt);
      if (body.data.title === undefined) throw badRequest();

      const event = checkEventFields({ ...body.data, title: body.data.title }, timeZone);
      // No repeat rule is stored; to extend a series, create a new one (R28).
      if (body.data.repeat) throw badRequest();

      // The location, when the body names it, goes through the database's narrow function (it changes
      // nothing else and refuses Outlook events); the update below then returns the row with it.
      const setLocation = async (eventId: string) => {
        if (event.location !== undefined) await query("select app.set_event_location($1, $2)", [eventId, event.location]);
      };

      // The travel mode works the same way: through its own narrow function, only when the body names it.
      const setTravelMode = async (eventId: string) => {
        if (!event.allDay && event.travelMode !== undefined) await query("select app.set_event_travel_mode($1, $2)", [eventId, event.travelMode]);
      };

      // Spec 24: the guests, only when the body names a list that differs from the saved one.
      const guests = checkGuests(body.data.guests);
      const guestsChange = guests !== undefined && !sameGuests(guests, row.guests ?? []);
      if (guestsChange) {
        await assertMayInvite(query, { seriesId: row.series_id, demo: row.demo });
        // Somebody new on the list needs an invitation, and only an event that has not ended sends one.
        // Taking guests off a past event stays possible.
        if (guests.some((address) => !(row.guests ?? []).includes(address))) assertNotEnded(event, deps.now(), timeZone);
        await query("update app.events set guests = $2::text[] where id = $1::uuid", [id, guests]);
      }

      if (event.allDay) {
        // A series is timed (R29: all-day events never repeat); the form does not offer this.
        if (row.series_id) throw badRequest();
        await setLocation(id);
        // An all-day event has no travel time (R29): a way of getting there kept from its timed days goes.
        if (row.travel_mode !== null) await query("select app.set_event_travel_mode($1, null)", [id]);
        const [updated] = await query<EventRow>(
          `update app.events
              set title = $2, all_day = true, start_at = null, end_at = null, first_day = $3, last_day = $4,
                  goal_id = null, status = 'planned'
            where id = $1
            returning ${EVENT_COLUMNS}`,
          [id, event.title, event.firstDay, event.lastDay],
        );
        return jsonOk({ message: MESSAGES.eventSaved, event: toEventDto(updated) });
      }

      // The goal must be the user's own, else "Not found" (R3). Left out of the body: the goal stays.
      if (event.goalId !== undefined) await assertOwnGoal(query, event.goalId);
      const goal = [event.goalId ?? null, event.goalId !== undefined];

      if (body.data.scope === "this_and_following" && row.series_id && row.start_at) {
        // This event and the later ones of the series, locked; each keeps its date (R28).
        const later = await query<EventRow>(
          `select ${EVENT_COLUMNS} from app.events where series_id = $1 and start_at >= $2 order by start_at for update`,
          [row.series_id, row.start_at],
        );
        const template = templateOf(event.startAt, event.endAt, timeZone);
        let opened: EventRow | undefined;
        for (const other of later) {
          await setLocation(other.id);
          await setTravelMode(other.id);
          const { startAt, endAt } = timesOn(localDateOf(new Date(other.start_at!), timeZone), template, timeZone);
          const [updated] = await query<EventRow>(
            `update app.events
                set title = $2, start_at = $3, end_at = $4, may_overlap = coalesce($5, may_overlap),
                    goal_id = case when $7 then $6 else goal_id end
              where id = $1
              returning ${EVENT_COLUMNS}`,
            [other.id, event.title, startAt, endAt, event.mayOverlap ?? null, ...goal],
          );
          if (other.id === id) opened = updated;
        }
        return jsonOk({ message: MESSAGES.seriesSaved, event: toEventDto(opened!), count: later.length });
      }

      // updated_at is set again by the database trigger; the user never sets it.
      await setLocation(id);
      await setTravelMode(id);
      const [updated] = await query<EventRow>(
        // may_overlap and goal_id change only when the body names them ($7: whether it names the goal).
        `update app.events
            set title = $2, all_day = false, start_at = $3, end_at = $4, first_day = null, last_day = null,
                may_overlap = coalesce($5, may_overlap),
                goal_id = case when $7 then $6 else goal_id end
          where id = $1
          returning ${EVENT_COLUMNS}`,
        [id, event.title, event.startAt, event.endAt, event.mayOverlap ?? null, ...goal],
      );
      return jsonOk({ message: MESSAGES.eventSaved, event: toEventDto(updated) });
    }).catch(asAnswer);
  });
}
