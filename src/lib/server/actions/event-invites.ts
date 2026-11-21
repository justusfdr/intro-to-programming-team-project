import "server-only";

// Event invitations inside the app (spec 54, ported from spec 36; ontology R59 to R64):
// - set_event_invites (POST /api/events/[id]/invites): the owner sets the invited contacts of one of
//   their events (contact row ids); the answer lists the invited people with their answers. With scope
//   "this_and_following" (spec 65) the later events of its series get the same people;
// - the owner's people of one event (GET /api/events/[id]/invites);
// - answer_event_invite (POST /api/invites/[id]/answer): the invited person answers;
// - the other people of an invitation (GET /api/invites/[id]/people);
// - the invited events of a window (GET /api/invites?from=…&to=…, at most 62 days);
// - the number not answered yet (GET /api/invites/count), for the sidebar's badge on pages that did
//   not read it.
// Each: same-origin check, signed in (R3), uuids only ("Not found" otherwise, the same as for a foreign
// or missing id), then one database function that checks the caller itself. Nothing of the event is
// written by an invited person (R63). Inviting is its own action: create_event and edit_event are
// unchanged. Nothing here logs a name, an address or a title (S8): a refusal of the database becomes
// its sentence, anything else goes to errors.ts, which logs only what the driver says.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { cleanNotes, notesTooLong } from "@/lib/events/notes";
import { travelFromOf, travelFromText, type SavedPlace } from "@/lib/places/saved";
import type { SettingsData } from "@/lib/settings/types";
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import type { EventRow } from "@/lib/server/events/rows";
import { googleMapsBrowserKey } from "@/lib/server/config";
import { routeMapUrl } from "@/lib/server/google/map";
import { googleRouting } from "@/lib/server/google/routes";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { readAcceptedInvite, readAcceptedRow } from "@/lib/server/invites/details";
import { cardsOfContacts, readEventInvitees, readInvitedEvents, readInvitePeople, readPendingInviteCount } from "@/lib/server/invites/read";
import { readPlaces } from "@/lib/server/places/saved";
import { readPeople } from "@/lib/server/profiles/cards";
import type { Routing } from "@/lib/server/routing/types";
import { requireUser } from "@/lib/server/session";
import { readSettings } from "@/lib/server/settings";
import { checkTodoTitle } from "@/lib/server/todos/input";
import { AFTER_3AM, travelOf, tripStart, withPreview, type TripStart } from "./travel-time";
import { GIVEN_ANSWERS, MAX_INVITEES, answeredText, type GivenAnswer } from "@/lib/invites/types";
import { MAX_WINDOW_DAYS } from "@/lib/shares/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An ISO time with its offset, as the calendar sends it. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

type ActionDeps = Pick<Deps, "auth" | "withUser">;

/**
 * The invited contacts, as contact row ids. More than the limit are let through to the database, which
 * answers with the ontology's sentence; far more than that is not a request the screen ever sends.
 */
const SetBody = z.object({
  contacts: z.array(z.string().max(40)).max(MAX_INVITEES * 5),
  // Spec 65: an event of a series may give the same people to the later events of its series too (R28).
  scope: z.enum(["this", "this_and_following"]).optional(),
});
const AnswerBody = z.object({ answer: z.enum(GIVEN_ANSWERS as [GivenAnswer, ...GivenAnswer[]]) });

/** The database's refusals as answers; anything else goes on unchanged. */
const KNOWN: ReadonlyArray<readonly [string, number, string]> = [
  [MESSAGES.invitesNotInSeries, 409, "invites_series"],
  [MESSAGES.invitesNotOutlook, 409, "invites_outlook"],
  [MESSAGES.invitesNotDemo, 409, "invites_demo"],
  [MESSAGES.invitesNotEnded, 409, "invites_ended"],
  [MESSAGES.tooManyInvitees, 409, "too_many_invitees"],
  [MESSAGES.inviteAnswerChoice, 400, "invite_answer"],
  [MESSAGES.inviteEnded, 409, "invite_ended"],
  [MESSAGES.shareWindow, 400, "invite_window"],
];

function inviteRefusal(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message === MESSAGES.notFound) throw notFound();
  for (const [text, status, code] of KNOWN) if (message === text) throw new ActionError(status, code, text);
  throw error;
}

/** POST: the owner sets the invited contacts of their event; answers with the people and their answers. */
export function setEventInvites(request: Request, deps: ActionDeps, eventId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, SetBody);
    if (!body.ok) return body.response;
    // A malformed event or contact id is "Not found", like a foreign one (R64).
    if (!UUID.test(eventId) || !body.data.contacts.every((id) => UUID.test(id))) throw notFound();
    try {
      const people = await deps.withUser(userId, async (query) => {
        const fn = body.data.scope === "this_and_following" ? "app.set_series_invites" : "app.set_event_invites";
        await query(`select ${fn}($1::uuid, $2::uuid[])`, [eventId, body.data.contacts]);
        return readEventInvitees(query, eventId);
      });
      return jsonOk({ message: MESSAGES.invitesSaved, people });
    } catch (error) {
      inviteRefusal(error);
    }
  });
}

/** GET: the owner's people of one event, with their answers. */
export function eventInvitees(request: Request, deps: ActionDeps, eventId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    if (!UUID.test(eventId)) throw notFound();
    try {
      const people = await deps.withUser(userId, (query) => readEventInvitees(query, eventId));
      return jsonOk({ people });
    } catch (error) {
      inviteRefusal(error);
    }
  });
}

/** POST: the invited person answers (accepted, tentative or declined). */
export function answerEventInvite(request: Request, deps: ActionDeps, inviteId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, AnswerBody);
    if (!body.ok) return body.response;
    if (!UUID.test(inviteId)) throw notFound();
    try {
      await deps.withUser(userId, (query) => query("select app.answer_event_invite($1::uuid, $2::text)", [inviteId, body.data.answer]));
    } catch (error) {
      inviteRefusal(error);
    }
    return jsonOk({ message: answeredText(body.data.answer), answer: body.data.answer });
  });
}

/** GET: the other people of the user's invitation, with their answers (names and photos only). */
export function invitePeople(request: Request, deps: ActionDeps, inviteId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    if (!UUID.test(inviteId)) throw notFound();
    try {
      const people = await deps.withUser(userId, (query) => readInvitePeople(query, inviteId));
      return jsonOk({ people });
    } catch (error) {
      inviteRefusal(error);
    }
  });
}

/** A time from the address, or null when it is missing or not a full ISO time. */
function timeParam(value: string | null): Date | null {
  if (value === null || !ISO_TIME.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** GET: the events between `from` and `to` (at most 62 days) the user is invited to. */
export function invitedEvents(request: Request, deps: ActionDeps): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const params = new URL(request.url).searchParams;
    const from = timeParam(params.get("from"));
    const to = timeParam(params.get("to"));
    if (!from || !to || to <= from || to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
      throw new ActionError(400, "invite_window", MESSAGES.shareWindow);
    }
    try {
      const events = await deps.withUser(userId, async (query) => {
        const people = await readPeople(query);
        return readInvitedEvents(query, from, to, cardsOfContacts(people.contacts));
      });
      return jsonOk({ events });
    } catch (error) {
      inviteRefusal(error);
    }
  });
}

/** GET: how many invitations the user has not answered yet (the badge on "Calendar"). */
export function pendingInviteCount(deps: ActionDeps): Promise<Response> {
  return handleAction(async () => {
    const userId = await requireUser(deps.auth);
    const count = await deps.withUser(userId, readPendingInviteCount);
    return jsonOk({ count });
  });
}

// ---------- Spec 55: an accepted invitation, almost like an own event (R65 to R67) ----------
// - read_accepted_invite_details (GET /api/invites/[id]/details): the full card;
// - the shared to-dos (POST /api/invites/[id]/todos, …/todos/[todoId]/rename|done|move|delete);
// - the shared notes (POST /api/invites/[id]/notes, with the notes last read);
// - the invited person's own goal and route (POST /api/invites/[id]/personal) and done mark
//   (POST /api/invites/[id]/done);
// - their own travel time to the event (GET /api/invites/[id]/travel).
// Each: same-origin check, signed in (R3), uuids only ("Not found" otherwise), then one database
// function that finds only the caller's own ACCEPTED invitation; pending, maybe, declined, someone
// else's and missing ones are "Not found" alike (R64). Every write answers with the whole card as it is
// now, so the screen shows what the database has. The title, times and place are never written (R63).

const DETAIL_KNOWN: ReadonlyArray<readonly [string, number, string]> = [
  [MESSAGES.todoTitleLength, 400, "todo_title_length"],
  [MESSAGES.tooManyTodos, 409, "too_many_todos"],
  [MESSAGES.notesChangedMeanwhile, 409, "notes_changed"],
  [MESSAGES.allDayNoGoal, 400, "all_day_goal"],
  [MESSAGES.allDayNotDone, 409, "all_day"],
  [MESSAGES.notStarted, 409, "not_started"],
];

function detailRefusal(error: unknown): never {
  if (error instanceof ActionError) throw error;
  const message = error instanceof Error ? error.message : "";
  if (message === MESSAGES.notFound) throw notFound();
  for (const [text, status, code] of DETAIL_KNOWN) if (message.includes(text)) throw new ActionError(status, code, text);
  // The database's own checks behind ours (two requests at the same moment, or a value our checks let through).
  if (message.includes("events_notes_length")) throw new ActionError(400, "notes_length", MESSAGES.notesLength);
  throw error;
}

/** Runs one request about the user's accepted invitation: same-origin, signed in, uuids, the body, then `run` as the user. */
function acceptedAction<T>(
  request: Request,
  deps: ActionDeps,
  ids: readonly string[],
  schema: z.ZodType<T> | null,
  run: (query: Query, body: T) => Promise<Response>,
): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    let body = undefined as T;
    if (schema) {
      const read = await readJson(request, schema);
      if (!read.ok) return read.response;
      body = read.data;
    }
    if (!ids.every((id) => UUID.test(id))) throw notFound();
    try {
      return await deps.withUser(userId, (query) => run(query, body));
    } catch (error) {
      detailRefusal(error);
    }
  });
}

/** A write's answer: its message and the whole card as the database has it now. */
async function detailsAnswer(query: Query, inviteId: string, message: string, status = 200): Promise<Response> {
  return jsonOk({ message, details: await readAcceptedInvite(query, inviteId) }, status);
}

/** GET: the full card of the user's accepted invitation (R65). */
export function acceptedInviteDetails(request: Request, deps: ActionDeps, inviteId: string): Promise<Response> {
  return acceptedAction(request, deps, [inviteId], null, async (query) => jsonOk({ details: await readAcceptedInvite(query, inviteId) }));
}

const TodoTitleBody = z.object({ title: z.string().max(1000) });
const DoneBody = z.object({ done: z.boolean() });
/** The new place, counted from 0; a place past the end means the end. */
const TodoMoveBody = z.object({ toIndex: z.number().int().min(0).max(99) });

/** POST: a shared to-do at the end of the list (R66). */
export function addInviteTodo(request: Request, deps: ActionDeps, inviteId: string): Promise<Response> {
  return acceptedAction(request, deps, [inviteId], TodoTitleBody, async (query, body) => {
    // The same checks as an own to-do (the database checks them again, and the limit under its lock).
    const title = checkTodoTitle(body.title);
    await query("select app.add_accepted_invite_todo($1::uuid, $2::text)", [inviteId, title]);
    return detailsAnswer(query, inviteId, MESSAGES.todoAdded, 201);
  });
}

/** POST: a new title for a shared to-do. */
export function renameInviteTodo(request: Request, deps: ActionDeps, inviteId: string, todoId: string): Promise<Response> {
  return acceptedAction(request, deps, [inviteId, todoId], TodoTitleBody, async (query, body) => {
    const title = checkTodoTitle(body.title);
    await query("select app.rename_accepted_invite_todo($1::uuid, $2::uuid, $3::text)", [inviteId, todoId, title]);
    return detailsAnswer(query, inviteId, MESSAGES.todoSaved);
  });
}

/** POST: a shared to-do done or not done again. */
export function tickInviteTodo(request: Request, deps: ActionDeps, inviteId: string, todoId: string): Promise<Response> {
  return acceptedAction(request, deps, [inviteId, todoId], DoneBody, async (query, body) => {
    await query("select app.tick_accepted_invite_todo($1::uuid, $2::uuid, $3::boolean)", [inviteId, todoId, body.done]);
    return detailsAnswer(query, inviteId, body.done ? MESSAGES.todoDone : MESSAGES.todoOpen);
  });
}

/** POST: a shared to-do to another place in the list; the others close up. */
export function moveInviteTodo(request: Request, deps: ActionDeps, inviteId: string, todoId: string): Promise<Response> {
  return acceptedAction(request, deps, [inviteId, todoId], TodoMoveBody, async (query, body) => {
    await query("select app.move_accepted_invite_todo($1::uuid, $2::uuid, $3::integer)", [inviteId, todoId, body.toIndex]);
    return detailsAnswer(query, inviteId, MESSAGES.todoMoved);
  });
}

/** POST: deletes a shared to-do; the later ones move up. */
export function deleteInviteTodo(request: Request, deps: ActionDeps, inviteId: string, todoId: string): Promise<Response> {
  return acceptedAction(request, deps, [inviteId, todoId], null, async (query) => {
    await query("select app.delete_accepted_invite_todo($1::uuid, $2::uuid)", [inviteId, todoId]);
    return detailsAnswer(query, inviteId, MESSAGES.todoDeleted);
  });
}

/** The notes as typed and the notes the screen last read (null: there were none). */
const NotesBody = z.object({ notes: z.string().max(20000).nullable(), before: z.string().max(20000).nullable() });

/** POST: the shared notes (R66); refused when they changed since the screen read them. */
export function setInviteNotes(request: Request, deps: ActionDeps, inviteId: string): Promise<Response> {
  return acceptedAction(request, deps, [inviteId], NotesBody, async (query, body) => {
    if (notesTooLong(body.notes)) throw new ActionError(400, "notes_length", MESSAGES.notesLength);
    await query("select app.set_accepted_invite_notes($1::uuid, $2::text, $3::text)", [inviteId, cleanNotes(body.notes) ?? "", body.before ?? ""]);
    return detailsAnswer(query, inviteId, MESSAGES.inviteNotesSaved);
  });
}

const TRAVEL_MODES = ["driving", "cycling", "walking", "transit"] as const;
/** The invited person's own choices, all three at once; null is none or the standard. */
const PersonalBody = z.object({
  goalId: z.string().max(40).nullable(),
  travelMode: z.enum(TRAVEL_MODES).nullable(),
  travelFrom: z.string().max(400).nullable(),
});

/** POST: the invited person's own goal, way of getting there and start of the trip (R67). */
export function setInvitePersonal(request: Request, deps: ActionDeps, inviteId: string): Promise<Response> {
  return acceptedAction(request, deps, [inviteId], PersonalBody, async (query, body) => {
    // A goal that is not a uuid is "Not found", like someone else's goal.
    if (body.goalId !== null && !UUID.test(body.goalId)) throw notFound();
    let travelFrom: string | null = null;
    if (body.travelFrom !== null) {
      travelFrom = travelFromText(travelFromOf(body.travelFrom));
      if (travelFrom === null) throw new ActionError(400, "bad_request", MESSAGES.badRequest);
    }
    await query("select app.set_accepted_invite_personal($1::uuid, $2::uuid, $3::text, $4::text)", [inviteId, body.goalId, body.travelMode, travelFrom]);
    return detailsAnswer(query, inviteId, MESSAGES.invitePersonalSaved);
  });
}

/** POST: the invited person marks the event done for themselves, or not done again (R67). */
export function setInviteDone(request: Request, deps: ActionDeps, inviteId: string): Promise<Response> {
  return acceptedAction(request, deps, [inviteId], DoneBody, async (query, body) => {
    await query("select app.set_accepted_invite_done($1::uuid, $2::boolean)", [inviteId, body.done]);
    return detailsAnswer(query, inviteId, body.done ? MESSAGES.inviteMarkedDone : MESSAGES.inviteMarkedPlanned);
  });
}

/**
 * GET: when the invited person should leave for the event (R27, R67): from their own start (their home,
 * a saved place, an address, or the place of their own event before it) with their own way of getting
 * there and their own buffer, to the owner's place. `mode` and `from` in the address count for this
 * answer only (the card asks while the user picks); the place itself cannot be changed. Nothing is saved.
 */
export function inviteTravelTime(request: Request, deps: ActionDeps, inviteId: string, routing: Routing = googleRouting()): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    if (!UUID.test(inviteId)) throw notFound();
    let found: { row: EventRow; settings: SettingsData; start: TripStart; places: SavedPlace[] };
    try {
      found = await deps.withUser(userId, async (query) => {
        const accepted = await readAcceptedRow(query, inviteId);
        const saved: EventRow = {
          id: accepted.invite_id,
          title: accepted.title,
          start_at: accepted.start_at === null ? null : new Date(accepted.start_at),
          end_at: accepted.end_at === null ? null : new Date(accepted.end_at),
          all_day: accepted.all_day,
          first_day: accepted.first_day,
          last_day: accepted.last_day,
          may_overlap: false,
          status: accepted.status,
          goal_id: null,
          series_id: null,
          source: "app",
          location: accepted.location,
          travel_mode: accepted.travel_mode,
          travel_from: accepted.travel_from,
          in_outlook: false,
          demo: false,
          updated_at: new Date(0),
          todo_count: 0,
          todos_done: 0,
        };
        // The preview may change the way and the start, never the place (it is the owner's).
        const row = { ...withPreview(saved, new URL(request.url)), location: saved.location };
        const [settings, places] = await Promise.all([readSettings(query), readPlaces(query)]);
        const before = await readOwnBefore(query, row.start_at, settings.timeZone);
        return { row, settings, places, start: tripStart(row, settings, places, before) };
      });
    } catch (error) {
      detailRefusal(error);
    }
    const travel = await travelOf(found.row, found.settings, routing, found.start, found.places);
    const map = travel?.status === "ok" ? routeMapUrl(found.start.address, found.row.location ?? "", travel.mode, googleMapsBrowserKey()) : null;
    return jsonOk({ travel: travel && map && travel.status === "ok" ? { ...travel, map } : travel });
  });
}

/**
 * The places of the user's OWN timed events that ended in the 12 hours before `start` and after the last
 * 3:00 at night before it (in `timeZone`), latest first (at
 * most 5): the first that is no web link is "the event before" (as for an own event). Only the user's own
 * rows (row-level security); the owner's calendar is never read.
 */
async function readOwnBefore(query: Query, start: Date | null, timeZone: string): Promise<string[]> {
  if (!start) return [];
  const rows = await query<{ location: string }>(
    `select location from app.events
      where not all_day and end_at <= $1 and end_at > $1 - interval '12 hours' and end_at > ${AFTER_3AM("$1::timestamptz", "$2")} and nullif(btrim(location), '') is not null
      order by end_at desc limit 5`,
    [start, timeZone],
  );
  return rows.map((r) => r.location);
}
