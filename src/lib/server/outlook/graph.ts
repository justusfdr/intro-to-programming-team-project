import "server-only";

// The real Outlook: Microsoft's sign-in (authorization code with PKCE) and the calendar of Microsoft
// Graph. Ported from the prototype's tested Graph module and translated. Every call gives up after
// 10 seconds; throttling (429) and server errors mean "not now". Tokens are never logged or returned.
import { addDays } from "@/lib/time/zoned";
import {
  OUTLOOK_SCOPE,
  OutlookRefusedError,
  OutlookUnavailableError,
  type OutgoingEvent,
  type OutlookEvent,
  type OutlookService,
  type SendOp,
  type SendResult,
  type TokenAnswer,
} from "./types";

const LOGIN = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";
export const TIMEOUT_MS = 10_000;
const MAX_PAGES = 10;
export const BATCH_SIZE = 20;
/** Outlook event ids are base64-like. Anything else ("..", "/") never goes into a path. */
const EVENT_ID = /^[A-Za-z0-9_=+-]{1,512}$/;
/** Refresh errors after which only a new sign-in helps. invalid_client is our own setup, not the user's. */
const SIGN_IN_AGAIN = new Set(["invalid_grant", "interaction_required"]);

type Fetch = typeof fetch;

export type GraphConfig = { clientId: string; clientSecret: string; tenant: string; redirectUri: string };

// ---------- Pure helpers (tested) ----------

export function authorizeUrl(config: GraphConfig, input: { state: string; challenge: string }): string {
  const url = new URL(`${LOGIN}/${encodeURIComponent(config.tenant)}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    response_mode: "query",
    scope: OUTLOOK_SCOPE,
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/** A token answer (JSON) into ours; null when a field is missing. */
export function parseTokenAnswer(json: unknown): TokenAnswer | null {
  if (!json || typeof json !== "object") return null;
  const body = json as Record<string, unknown>;
  if (typeof body.access_token !== "string" || body.access_token === "") return null;
  return {
    kind: "ok",
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token !== "" ? body.refresh_token : null,
    scope: typeof body.scope === "string" ? body.scope : "",
  };
}

/** Graph's "2026-11-05T09:00:00.0000000" (UTC, without Z) as an ISO time; null when it does not fit. */
export function graphTimeToIso(dateTime: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d+))?$/.exec(dateTime);
  if (!m) return null;
  const iso = `${m[1]}:${m[2] ?? "00"}.${(m[3] ?? "").slice(0, 3).padEnd(3, "0")}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
}

/**
 * The calendar day an all-day boundary stands for. Outlook gives midnight in the event's own zone,
 * converted to UTC (for example 23:00 the day before for Berlin). Zones lie within 12 hours of UTC,
 * so the nearest midnight is the day.
 */
export function allDayDate(iso: string): string {
  return new Date(Date.parse(iso) + 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function clean(text: unknown, max: number): string | null {
  if (typeof text !== "string") return null;
  const value = [...text.replace(/\s+/g, " ").trim()].slice(0, max).join("").trim();
  return value === "" ? null : value;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One Graph event into ours, or null: cancelled, "free", broken, not in UTC, or not something our
 * rules can hold (a timed event over 24 hours, an all-day event over 31 days).
 */
export function mapGraphEvent(raw: unknown): OutlookEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== "string" || !EVENT_ID.test(e.id)) return null;
  if (e.isCancelled === true || e.showAs === "free") return null;
  const start = e.start as { dateTime?: unknown; timeZone?: unknown } | undefined;
  const end = e.end as { dateTime?: unknown; timeZone?: unknown } | undefined;
  if (typeof start?.dateTime !== "string" || typeof end?.dateTime !== "string") return null;
  const utc = (zone: unknown) => zone === undefined || (typeof zone === "string" && /^(utc|etc\/utc)$/i.test(zone));
  if (!utc(start.timeZone) || !utc(end.timeZone)) return null;
  const startAt = graphTimeToIso(start.dateTime);
  const endAt = graphTimeToIso(end.dateTime);
  if (!startAt || !endAt || endAt <= startAt) return null;

  const title = clean(e.subject, 100) ?? "Event";
  const location = clean((e.location as { displayName?: unknown } | null | undefined)?.displayName, 200);
  const transactionId = typeof e.transactionId === "string" ? e.transactionId : null;
  const base = { outlookId: e.id, title, location, transactionId };

  if (e.isAllDay === true) {
    const firstDay = allDayDate(startAt);
    const lastDay = addDays(allDayDate(endAt), -1);
    if (lastDay < firstDay) return null;
    const days = Math.round((Date.parse(lastDay) - Date.parse(firstDay)) / DAY_MS) + 1;
    if (days > 31) return null;
    return { ...base, allDay: true, startAt: null, endAt: null, firstDay, lastDay };
  }
  if (Date.parse(endAt) - Date.parse(startAt) > DAY_MS) return null;
  return { ...base, allDay: false, startAt, endAt, firstDay: null, lastDay: null };
}

/** The next page's address, only on graph.microsoft.com's calendar view (the token goes there). */
export function safeNextLink(next: unknown): string | null {
  if (next === undefined || next === null) return null;
  if (typeof next !== "string") throw new OutlookUnavailableError();
  let url: URL;
  try {
    url = new URL(next);
  } catch {
    throw new OutlookUnavailableError();
  }
  if (url.origin !== "https://graph.microsoft.com" || !url.pathname.startsWith("/v1.0/me/calendarView")) {
    throw new OutlookUnavailableError();
  }
  return url.toString();
}

const graphTime = (iso: string) => new Date(iso).toISOString().slice(0, 19);

/** The JSON body Graph gets for one of our events. */
export function graphBody(event: OutgoingEvent, create: boolean): Record<string, unknown> {
  const times = event.allDay
    ? {
        isAllDay: true,
        start: { dateTime: `${event.firstDay}T00:00:00`, timeZone: "UTC" },
        end: { dateTime: `${addDays(event.lastDay!, 1)}T00:00:00`, timeZone: "UTC" },
      }
    : {
        isAllDay: false,
        start: { dateTime: graphTime(event.startAt!), timeZone: "UTC" },
        end: { dateTime: graphTime(event.endAt!), timeZone: "UTC" },
      };
  return {
    subject: event.title,
    ...times,
    ...(create ? { transactionId: event.transactionId, showAs: "busy", isReminderOn: false } : {}),
  };
}

/** One batch request (at most 20 ops) as Graph's $batch body. */
export function batchBody(ops: SendOp[]): { requests: Record<string, unknown>[] } {
  return {
    requests: ops.map((op, i) => {
      const id = String(i);
      if (op.kind === "create") {
        return { id, method: "POST", url: "/me/events", headers: { "Content-Type": "application/json" }, body: graphBody(op.event, true) };
      }
      const url = `/me/events/${encodeURIComponent(op.outlookId)}`;
      if (op.kind === "update") {
        return { id, method: "PATCH", url, headers: { "Content-Type": "application/json" }, body: graphBody(op.event, false) };
      }
      return { id, method: "DELETE", url };
    }),
  };
}

/** Graph's $batch answer into one result per op. */
export function parseBatchAnswer(ops: SendOp[], json: unknown): SendResult[] {
  const responses = Array.isArray((json as { responses?: unknown })?.responses)
    ? ((json as { responses: unknown[] }).responses as { id?: unknown; status?: unknown; body?: unknown }[])
    : [];
  return ops.map((op, i) => {
    const answer = responses.find((r) => r.id === String(i));
    const status = typeof answer?.status === "number" ? answer.status : 0;
    if (status >= 200 && status < 300) {
      if (op.kind !== "create") return { ref: op.ref, kind: "done", outlookId: op.outlookId };
      const id = (answer?.body as { id?: unknown } | undefined)?.id;
      return typeof id === "string" && EVENT_ID.test(id) ? { ref: op.ref, kind: "done", outlookId: id } : { ref: op.ref, kind: "later" };
    }
    if (status === 404 && op.kind !== "create") return { ref: op.ref, kind: "gone" };
    return { ref: op.ref, kind: "later" };
  });
}

// ---------- Calls ----------

async function call(fetchFn: Fetch, url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetchFn(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return null; // network error or 10 seconds passed
  }
}

async function errorCode(res: Response, field: "error" | "graph"): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (field === "error") return typeof body.error === "string" ? body.error : null;
    const code = (body.error as { code?: unknown } | undefined)?.code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

/** A 401 that means "this token is not valid", not a problem of the account. */
async function isTokenRefused(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  const code = await errorCode(res, "graph");
  return code === null || code === "InvalidAuthenticationToken";
}

export function createGraphOutlook(config: GraphConfig, fetchFn: Fetch = fetch): OutlookService {
  async function token(fields: Record<string, string>, refusedCodes: Set<string> | "any"): Promise<TokenAnswer> {
    const res = await call(fetchFn, `${LOGIN}/${encodeURIComponent(config.tenant)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...fields, client_id: config.clientId, client_secret: config.clientSecret, scope: OUTLOOK_SCOPE }),
    });
    if (!res) return { kind: "unavailable" };
    if (!res.ok) {
      if (res.status !== 400 && res.status !== 401) return { kind: "unavailable" };
      const code = await errorCode(res, "error");
      return refusedCodes === "any" || (code !== null && refusedCodes.has(code)) ? { kind: "refused" } : { kind: "unavailable" };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { kind: "unavailable" };
    }
    return parseTokenAnswer(json) ?? { kind: "unavailable" };
  }

  return {
    authorizeUrl: (input) => authorizeUrl(config, input),

    exchangeCode: ({ code, verifier }) =>
      token({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: config.redirectUri }, "any"),

    refresh: (refreshToken) => token({ grant_type: "refresh_token", refresh_token: refreshToken }, SIGN_IN_AGAIN),

    async listEvents(accessToken, from, to) {
      const first = new URL(`${GRAPH}/me/calendarView`);
      first.search = new URLSearchParams({
        startDateTime: from.toISOString(),
        endDateTime: to.toISOString(),
        $select: "id,subject,start,end,isAllDay,showAs,isCancelled,location,transactionId",
        $top: "250",
      }).toString();
      const events: OutlookEvent[] = [];
      let url: string | null = first.toString();
      for (let page = 0; url && page < MAX_PAGES; page++) {
        const res = await call(fetchFn, url, {
          headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
        });
        if (!res) throw new OutlookUnavailableError();
        if (await isTokenRefused(res)) throw new OutlookRefusedError();
        if (!res.ok) throw new OutlookUnavailableError();
        let body: { value?: unknown; "@odata.nextLink"?: unknown };
        try {
          body = (await res.json()) as typeof body;
        } catch {
          throw new OutlookUnavailableError();
        }
        for (const raw of Array.isArray(body.value) ? body.value : []) {
          const event = mapGraphEvent(raw);
          if (event) events.push(event);
        }
        url = safeNextLink(body["@odata.nextLink"]);
      }
      return events;
    },

    async send(accessToken, ops) {
      const results: SendResult[] = [];
      // An id that is not Outlook's shape never goes into a path: as if Outlook no longer had it.
      const valid = ops.filter((op) => op.kind === "create" || EVENT_ID.test(op.outlookId));
      for (const op of ops) if (!valid.includes(op)) results.push({ ref: op.ref, kind: "gone" });
      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        const batch = valid.slice(i, i + BATCH_SIZE);
        const res = await call(fetchFn, `${GRAPH}/$batch`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(batchBody(batch)),
        });
        if (res && (await isTokenRefused(res))) throw new OutlookRefusedError();
        let json: unknown = null;
        if (res?.ok) {
          try {
            json = await res.json();
          } catch {
            json = null;
          }
        }
        if (!json) {
          // Down, slow or throttled: this batch and the rest wait for the next sync.
          for (const op of valid.slice(i)) results.push({ ref: op.ref, kind: "later" });
          break;
        }
        results.push(...parseBatchAnswer(batch, json));
      }
      return results;
    },
  };
}
