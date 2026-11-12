import "server-only";

// A stand-in for Outlook in tests: one calendar per refresh token, kept in memory, with switches for
// "Microsoft refuses", "Outlook is down" and "throttled". It follows the same contract as graph.ts.
import {
  OUTLOOK_SCOPE,
  OutlookRefusedError,
  OutlookUnavailableError,
  type OutgoingEvent,
  type OutlookEvent,
  type OutlookService,
  type SendResult,
  type TokenAnswer,
} from "./types";

type Account = { refreshToken: string; events: Map<string, OutlookEvent> };

export class FakeOutlook implements OutlookService {
  /** What the next code exchange answers: grant everything, only some scopes, or refuse. */
  consent: "grant" | "read_only" | "refuse" | "no_refresh_token" = "grant";
  /** Microsoft refuses the stored access (password changed, access removed). */
  refusing = false;
  /** Outlook is down or slow: every call fails as "not now". */
  down = false;
  /** Outlook answers 429 to these refs (or to every send with "all"). */
  throttled: Set<string> | "all" = new Set();
  /** Every call, in order, without tokens. */
  readonly calls: string[] = [];

  private accounts = new Map<string, Account>(); // by the code its sign-in returns
  private byRefresh = new Map<string, Account>();
  private byAccess = new Map<string, Account>();
  private counter = 0;

  /** Makes a Microsoft account with these events; returns the code its sign-in would return. */
  account(events: OutlookEvent[] = []): string {
    const code = `code-${++this.counter}`;
    const account: Account = { refreshToken: `refresh-${this.counter}`, events: new Map(events.map((e) => [e.outlookId, e])) };
    this.accounts.set(code, account);
    return code;
  }

  /** The events of the account a code belongs to (to look at or change in a test). */
  eventsOf(code: string): Map<string, OutlookEvent> {
    return this.accounts.get(code)!.events;
  }

  reset() {
    this.consent = "grant";
    this.refusing = false;
    this.down = false;
    this.throttled = new Set();
    this.calls.length = 0;
    this.accounts.clear();
    this.byRefresh.clear();
    this.byAccess.clear();
    this.counter = 0;
  }

  authorizeUrl({ state, challenge }: { state: string; challenge: string }): string {
    return `https://login.example.test/authorize?state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;
  }

  private issue(account: Account, rotate: boolean): TokenAnswer {
    if (rotate) {
      this.byRefresh.delete(account.refreshToken);
      account.refreshToken = `${account.refreshToken}+`;
    }
    this.byRefresh.set(account.refreshToken, account);
    const accessToken = `access-${++this.counter}`;
    this.byAccess.set(accessToken, account);
    return { kind: "ok", accessToken, refreshToken: account.refreshToken, scope: OUTLOOK_SCOPE };
  }

  async exchangeCode({ code, verifier }: { code: string; verifier: string }): Promise<TokenAnswer> {
    this.calls.push(`exchange ${code}`);
    if (this.down) return { kind: "unavailable" };
    const account = this.accounts.get(code);
    if (!account || this.consent === "refuse" || verifier.length < 43) return { kind: "refused" };
    const answer = this.issue(account, false);
    if (answer.kind !== "ok") return answer;
    if (this.consent === "read_only") return { ...answer, scope: "offline_access https://graph.microsoft.com/Calendars.Read" };
    if (this.consent === "no_refresh_token") return { ...answer, refreshToken: null };
    return answer;
  }

  async refresh(refreshToken: string): Promise<TokenAnswer> {
    this.calls.push("refresh");
    if (this.down) return { kind: "unavailable" };
    const account = this.byRefresh.get(refreshToken);
    if (!account || this.refusing) return { kind: "refused" };
    // Microsoft usually sends a new refresh token; the fake always does, so rotation is tested.
    return this.issue(account, true);
  }

  private accountFor(accessToken: string): Account {
    if (this.down) throw new OutlookUnavailableError();
    const account = this.byAccess.get(accessToken);
    if (!account || this.refusing) throw new OutlookRefusedError();
    return account;
  }

  async listEvents(accessToken: string, from: Date, to: Date): Promise<OutlookEvent[]> {
    this.calls.push(`list ${from.toISOString()} ${to.toISOString()}`);
    const account = this.accountFor(accessToken);
    const fromDay = from.toISOString().slice(0, 10);
    const toDay = to.toISOString().slice(0, 10);
    return [...account.events.values()].filter((e) =>
      e.allDay ? e.lastDay! >= fromDay && e.firstDay! <= toDay : e.endAt! > from.toISOString() && e.startAt! < to.toISOString(),
    );
  }

  async send(accessToken: string, ops: Parameters<OutlookService["send"]>[1]): Promise<SendResult[]> {
    const account = this.accountFor(accessToken);
    const results: SendResult[] = [];
    for (let i = 0; i < ops.length; i += 20) {
      const batch = ops.slice(i, i + 20);
      this.calls.push(`batch ${batch.length}`);
      for (const op of batch) {
        if (this.throttled === "all" || this.throttled.has(op.ref)) {
          results.push({ ref: op.ref, kind: "later" });
          continue;
        }
        if (op.kind === "create") {
          // Like Outlook: one event per transactionId.
          const existing = [...account.events.values()].find((e) => e.transactionId === op.event.transactionId);
          const outlookId = existing?.outlookId ?? `AAMk-${++this.counter}`;
          account.events.set(outlookId, toOutlook(outlookId, op.event));
          results.push({ ref: op.ref, kind: "done", outlookId });
        } else if (!account.events.has(op.outlookId)) {
          results.push({ ref: op.ref, kind: "gone" });
        } else if (op.kind === "update") {
          account.events.set(op.outlookId, toOutlook(op.outlookId, op.event));
          results.push({ ref: op.ref, kind: "done", outlookId: op.outlookId });
        } else {
          account.events.delete(op.outlookId);
          results.push({ ref: op.ref, kind: "done", outlookId: op.outlookId });
        }
      }
    }
    return results;
  }
}

function toOutlook(outlookId: string, event: OutgoingEvent): OutlookEvent {
  return {
    outlookId,
    title: event.title,
    allDay: event.allDay,
    startAt: event.startAt,
    endAt: event.endAt,
    firstDay: event.firstDay,
    lastDay: event.lastDay,
    location: null,
    transactionId: event.transactionId,
  };
}
