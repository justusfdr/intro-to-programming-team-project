import "server-only";

// Outlook as our server sees it. Two implementations, like the sign-in service:
// - graph.ts talks to Microsoft (sign-in and the calendar of Microsoft Graph);
// - fake.ts keeps a calendar in memory (tests; no network, no secret).
// Nothing else imports Microsoft's addresses or answer shapes.

/** Microsoft's answer to a code exchange or a refresh. */
export type TokenAnswer =
  /** `scope` is what the user actually granted; `refreshToken` is null when Microsoft did not send a new one. */
  | { kind: "ok"; accessToken: string; refreshToken: string | null; scope: string }
  /** The code or the stored access is not valid any more (the user must sign in again). */
  | { kind: "refused" }
  /** Microsoft is down, slow (10 seconds) or throttling: try again later. */
  | { kind: "unavailable" };

/** An event as Outlook lists it, already shaped for our rules (R29, R11). */
export type OutlookEvent = {
  outlookId: string;
  title: string;
  allDay: boolean;
  /** ISO times in UTC, for a timed event. */
  startAt: string | null;
  endAt: string | null;
  /** "2026-11-16", for an all-day event; the last day is included. */
  firstDay: string | null;
  lastDay: string | null;
  location: string | null;
  /** The transactionId we gave an event we created (our event id), if any. */
  transactionId: string | null;
};

/** What we send for an app event. */
export type OutgoingEvent = {
  title: string;
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  firstDay: string | null;
  lastDay: string | null;
  /** Our event id: Outlook creates an event only once per transactionId. */
  transactionId: string;
};

/** One change for Outlook. `ref` comes back in the result. */
export type SendOp =
  | { kind: "create"; ref: string; event: OutgoingEvent }
  | { kind: "update"; ref: string; outlookId: string; event: OutgoingEvent }
  | { kind: "delete"; ref: string; outlookId: string };

export type SendResult =
  /** Done; for a create, the new event's id. */
  | { ref: string; kind: "done"; outlookId: string | null }
  /** Outlook does not have that event (any more). */
  | { ref: string; kind: "gone" }
  /** Not now (throttled, Outlook busy or down): try at the next sync. */
  | { ref: string; kind: "later" };

/** Microsoft refused the access token while it should be valid: treat as "sign in again". */
export class OutlookRefusedError extends Error {
  constructor() {
    super("Microsoft refused the access.");
    this.name = "OutlookRefusedError";
  }
}

/** Microsoft is down, slow or throttling. Nothing changes; the next sync tries again. */
export class OutlookUnavailableError extends Error {
  constructor() {
    super("Outlook is not available right now.");
    this.name = "OutlookUnavailableError";
  }
}

export interface OutlookService {
  /** The address of Microsoft's sign-in page for this attempt. */
  authorizeUrl(input: { state: string; challenge: string }): string;
  /** Trades the code from the callback for tokens (PKCE). */
  exchangeCode(input: { code: string; verifier: string }): Promise<TokenAnswer>;
  /** A new access token from the stored refresh token. */
  refresh(refreshToken: string): Promise<TokenAnswer>;
  /** Events from `from` to `to`, repeating ones as single events, without cancelled and "free" ones. */
  listEvents(accessToken: string, from: Date, to: Date): Promise<OutlookEvent[]>;
  /** Sends changes in batches of at most 20; one result per op, in any order. */
  send(accessToken: string, ops: SendOp[]): Promise<SendResult[]>;
}

/** The scope we ask for: read and write the calendar, and stay connected (R26). */
export const OUTLOOK_SCOPE = "offline_access https://graph.microsoft.com/Calendars.ReadWrite";

/** True when Microsoft granted writing the calendar (declined or partly granted: false). */
export function grantsCalendarWrite(scope: string): boolean {
  return scope.split(/\s+/).some((s) => /(^|\/)calendars\.readwrite$/i.test(s));
}
