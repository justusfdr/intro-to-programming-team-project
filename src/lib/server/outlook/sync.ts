import "server-only";

// sync_outlook (ontology "By itself", R26) and sending app events to Outlook.
// Database work runs in short withUser transactions; Microsoft is called between them, never while a
// transaction (and its row locks) is open. Each Microsoft call gives up after 10 seconds.
import type { Deps } from "@/lib/server/deps";
import type { Query } from "@/lib/server/db";
import { readTimeZone } from "@/lib/server/settings";
import { localDateOf } from "@/lib/time/zoned";
import { open, seal, tokenPurpose } from "./box";
import { OutlookRefusedError, OutlookUnavailableError, type OutlookService, type SendOp } from "./types";

/** What the server needs for Outlook; null when it is not set up (no app registration or no key). */
export type OutlookDeps = { service: OutlookService; key: Buffer } | null;

export type OutlookStatus = "none" | "connected" | "needs_reconnect";
export type OutlookState = { status: OutlookStatus; lastSyncedAt: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;
/** R26 window: 7 days back to 60 days ahead. */
export const WINDOW_BACK_DAYS = 7;
export const WINDOW_AHEAD_DAYS = 60;
/** At most this many changes go to Outlook per run; the rest go at the next one. */
export const MAX_SENT_PER_RUN = 100;

/** The user's connection as the page shows it (never the token). */
export async function readOutlookState(query: Query): Promise<OutlookState> {
  const [row] = await query<{ status: "connected" | "needs_reconnect"; last_synced_at: Date | null }>(
    "select status, last_synced_at from app.calendar_connections",
  );
  if (!row) return { status: "none", lastSyncedAt: null };
  return { status: row.status, lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null };
}

type Access = { kind: "ok"; token: string } | { kind: "none" } | { kind: "refused" } | { kind: "unavailable" };

/**
 * A fresh access token from the stored refresh token. Saves the new refresh token Microsoft sends.
 * A refused or unreadable token sets the connection to needs_reconnect.
 */
async function getAccess(deps: Deps, userId: string, outlook: NonNullable<OutlookDeps>): Promise<Access> {
  const [row] = await deps.withUser(userId, (q) => q<{ t: string | null }>("select app.outlook_token() as t"));
  if (!row?.t) return { kind: "none" };
  const refreshToken = open(row.t, tokenPurpose(userId), outlook.key);
  const answer = refreshToken ? await outlook.service.refresh(refreshToken) : ({ kind: "refused" } as const);
  if (answer.kind === "refused") {
    await markNeedsReconnect(deps, userId);
    return { kind: "refused" };
  }
  if (answer.kind === "unavailable") return { kind: "unavailable" };
  if (answer.refreshToken && answer.refreshToken !== refreshToken) {
    const sealed = seal(answer.refreshToken, tokenPurpose(userId), outlook.key);
    await deps.withUser(userId, (q) => q("select app.outlook_save_token($1)", [sealed]));
  }
  return { kind: "ok", token: answer.accessToken };
}

async function markNeedsReconnect(deps: Deps, userId: string) {
  await deps.withUser(userId, (q) => q("select app.outlook_needs_reconnect()"));
}

type PendingRow = {
  id: string;
  title: string;
  all_day: boolean;
  start_at: Date | null;
  end_at: Date | null;
  first_day: string | null;
  last_day: string | null;
  location: string | null;
  outlook_id: string | null;
  updated_at: Date;
};

/**
 * Sends what Outlook does not have yet (R26): deletions of sent app events, then app and assistant
 * events that have not ended and are new or changed since they were sent (never demo events, spec 13,
 * as in the prototype). Throws OutlookRefusedError
 * or OutlookUnavailableError for the whole run; single events that must wait simply stay pending.
 */
async function sendPending(deps: Deps, userId: string, service: OutlookService, accessToken: string): Promise<number> {
  const now = deps.now();
  const { deletions, events } = await deps.withUser(userId, async (q) => {
    const timeZone = await readTimeZone(q);
    const deletions = await q<{ outlook_id: string }>(
      "select outlook_id from app.outlook_deletions order by created_at limit $1",
      [MAX_SENT_PER_RUN],
    );
    const events = await q<PendingRow>(
      `select id, title, all_day, start_at, end_at, first_day::text as first_day, last_day::text as last_day, location, outlook_id, updated_at
         from app.events
        where source <> 'outlook'
          and not demo
          and (outlook_id is null or outlook_sent_version is distinct from updated_at)
          and (case when all_day then last_day >= $2::date else end_at > $1 end)
        order by coalesce(start_at, first_day::timestamptz), id
        limit $3`,
      [now, localDateOf(now, timeZone), MAX_SENT_PER_RUN - deletions.length],
    );
    return { deletions, events };
  });

  const versions = new Map(events.map((e) => [e.id, new Date(e.updated_at).toISOString()]));
  const ops: SendOp[] = [
    ...deletions.map((d): SendOp => ({ kind: "delete", ref: `deleted:${d.outlook_id}`, outlookId: d.outlook_id })),
    ...events.map((e): SendOp => {
      const event = {
        title: e.title,
        allDay: e.all_day,
        startAt: e.start_at ? new Date(e.start_at).toISOString() : null,
        endAt: e.end_at ? new Date(e.end_at).toISOString() : null,
        firstDay: e.first_day,
        lastDay: e.last_day,
        location: e.location,
        transactionId: e.id,
      };
      return e.outlook_id ? { kind: "update", ref: e.id, outlookId: e.outlook_id, event } : { kind: "create", ref: e.id, event };
    }),
  ];
  if (ops.length === 0) return 0;

  const results = await service.send(accessToken, ops);
  const forgotten: string[] = [];
  const sent: { event_id: string; version: string | undefined; outlook_id: string | null }[] = [];
  for (const result of results) {
    if (result.ref.startsWith("deleted:")) {
      if (result.kind !== "later") forgotten.push(result.ref.slice("deleted:".length));
    } else if (result.kind === "done") {
      sent.push({ event_id: result.ref, version: versions.get(result.ref), outlook_id: result.outlookId });
    } else if (result.kind === "gone") {
      // Outlook no longer has the copy: forget it, so the next run creates it again.
      sent.push({ event_id: result.ref, version: undefined, outlook_id: null });
    }
  }
  await deps.withUser(userId, async (q) => {
    if (sent.length > 0) await q("select app.outlook_mark_sent($1::jsonb)", [JSON.stringify(sent)]);
    if (forgotten.length > 0) await q("select app.outlook_forget_deletions($1)", [forgotten]);
  });
  return sent.length + forgotten.length;
}

export type SyncResult =
  /** No connection, or a sync started less than 5 minutes ago. */
  | { ran: false }
  /** Synced: Outlook's events imported and pending app events sent. */
  | { ran: true; ok: true }
  /** Stopped: Microsoft refused the access (needs_reconnect) or Outlook is not available now. */
  | { ran: true; ok: false; reason: "refused" | "unavailable" };

/** sync_outlook: at most every 5 minutes (checked by the database), 7 days back to 60 ahead. */
export async function syncOutlook(deps: Deps, outlook: OutlookDeps, userId: string): Promise<SyncResult> {
  if (!outlook) return { ran: false };
  const [started] = await deps.withUser(userId, (q) => q<{ ok: boolean }>("select app.outlook_begin_sync() as ok"));
  if (!started?.ok) return { ran: false };

  const access = await getAccess(deps, userId, outlook);
  if (access.kind === "none") return { ran: false };
  if (access.kind !== "ok") return { ran: true, ok: false, reason: access.kind };

  try {
    await sendPending(deps, userId, outlook.service, access.token);
    const now = deps.now().getTime();
    const from = new Date(now - WINDOW_BACK_DAYS * DAY_MS);
    const to = new Date(now + WINDOW_AHEAD_DAYS * DAY_MS);
    const events = await outlook.service.listEvents(access.token, from, to);
    const rows = events.map((e) => ({
      outlook_id: e.outlookId,
      title: e.title,
      all_day: e.allDay,
      start_at: e.startAt,
      end_at: e.endAt,
      first_day: e.firstDay,
      last_day: e.lastDay,
      location: e.location,
      transaction_id: e.transactionId,
    }));
    await deps.withUser(userId, async (q) => {
      await q("select app.outlook_import($1, $2, $3::jsonb)", [from, to, JSON.stringify(rows)]);
      await q("select app.outlook_finish_sync()");
    });
    return { ran: true, ok: true };
  } catch (error) {
    if (error instanceof OutlookRefusedError) {
      await markNeedsReconnect(deps, userId);
      return { ran: true, ok: false, reason: "refused" };
    }
    if (error instanceof OutlookUnavailableError) return { ran: true, ok: false, reason: "unavailable" };
    throw error;
  }
}

/**
 * Sends pending app events now, without the 5-minute wait (after the user saved or deleted an event).
 * Returns how many changes Outlook took; 0 when not connected or Outlook is not available.
 */
export async function sendToOutlook(deps: Deps, outlook: OutlookDeps, userId: string): Promise<number> {
  if (!outlook) return 0;
  const access = await getAccess(deps, userId, outlook);
  if (access.kind !== "ok") return 0;
  try {
    return await sendPending(deps, userId, outlook.service, access.token);
  } catch (error) {
    if (error instanceof OutlookRefusedError) {
      await markNeedsReconnect(deps, userId);
      return 0;
    }
    if (error instanceof OutlookUnavailableError) return 0;
    throw error;
  }
}
