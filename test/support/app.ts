// Everything an action test needs: the temporary database, the fake sign-in service wired to it
// (a new account writes auth.users, so the sign-up trigger runs for real), a movable clock,
// and helpers to build requests the way a browser on our own site sends them.
import { FakeAuth } from "@/lib/server/auth/fake";
import type { Deps } from "@/lib/server/deps";
import { FakeOutlook } from "@/lib/server/outlook/fake";
import type { OutlookDeps } from "@/lib/server/outlook/sync";
import { createTestDb, type TestDb } from "../db/harness";

export const OWN_ORIGIN = "http://localhost:3000";

/** The key that encrypts the stored Outlook access in tests (32 bytes, not a secret). */
export const OUTLOOK_TEST_KEY = Buffer.alloc(32, 42);

export type TestApp = {
  db: TestDb;
  auth: FakeAuth;
  deps: Deps;
  /** The stand-in Outlook, and what route handlers would get as the Outlook dependency. */
  outlook: FakeOutlook;
  outlookDeps: NonNullable<OutlookDeps>;
  /**
   * Everything an action could change: rows in auth.users and in every table of the app schema
   * (found automatically, so new tables are included), the fake's accounts (confirmed, password),
   * e-mails sent and the session. Compare before and after a rejection to prove nothing changed (R1).
   */
  snapshot(): Promise<Record<string, unknown>>;
  /**
   * Creates a confirmed account (if it does not exist yet) and signs it in, replacing the current
   * session. Returns the user id. Call it twice with different emails for two users; the session
   * belongs to the last one.
   */
  signedInAs(email: string, options?: { timeZone?: string }): Promise<string>;
  /** The fake clock's current time. */
  now(): Date;
  /** Empties the database and the fake sign-in service and sets the clock back. Call it in beforeEach. */
  reset(): Promise<void>;
  /** Moves the fake clock forward. */
  advance(ms: number): void;
  close(): Promise<void>;
};

export async function createTestApp(): Promise<TestApp> {
  const db = await createTestDb();
  // The fake clock starts at Monday 16 November 2026, 09:00 UTC, and reset() sets it back there.
  const START = Date.parse("2026-11-16T09:00:00Z");
  let now = START;
  const auth = new FakeAuth({
    now: () => now,
    onUserCreated: async ({ id, email, timeZone }) => {
      await db.createUser(email, { id, timeZone });
    },
  });
  const outlook = new FakeOutlook();
  return {
    db,
    auth,
    deps: { auth, withUser: db.withUser, now: () => new Date(now) },
    outlook,
    outlookDeps: { service: outlook, key: OUTLOOK_TEST_KEY },
    async snapshot() {
      const tables: Record<string, unknown> = {};
      const names = await db.admin<{ name: string }>(
        "select table_name as name from information_schema.tables where table_schema = 'app' order by table_name",
      );
      // Table names come from the database itself, not from input.
      for (const { name } of names) tables[name] = await db.admin(`select * from app.${name} order by 1`);
      return {
        users: await db.admin("select id, email from auth.users order by email"),
        tables,
        accounts: auth.accounts(),
        emails: [...auth.outbox],
        session: auth.session && { ...auth.session },
      };
    },
    async signedInAs(email, options = {}) {
      const password = "test-password";
      if (!auth.hasUser(email)) await auth.addUser(email, password, { confirmed: true, timeZone: options.timeZone });
      const result = await auth.signIn({ email, password });
      if (result.kind !== "signed_in") throw new Error(`signedInAs: ${email} could not sign in (${result.kind})`);
      return auth.session!.userId;
    },
    now: () => new Date(now),
    async reset() {
      now = START;
      auth.reset();
      outlook.reset();
      await db.admin("delete from auth.users");
    },
    advance(ms) {
      now += ms;
    },
    close: () => db.close(),
  };
}

/** A JSON POST from our own pages (same origin), unless `headers` overrides it. */
export function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${OWN_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "localhost:3000",
      origin: OWN_ORIGIN,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Status and JSON body of an answer, for one-line assertions. */
export async function read(response: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** The id of our extension in the tests (the committed default). */
export const EXTENSION_ORIGIN = "chrome-extension://dghmihlicabdooieaknglfjlidpjjfki";

/** A POST as our extension's service worker sends it (blocker design): its Origin, Sec-Fetch-Site "none". */
export function fromExtension(path: string, body: unknown = {}, headers: Record<string, string> = {}): Request {
  return new Request(`${OWN_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "localhost:3000",
      origin: EXTENSION_ORIGIN,
      "sec-fetch-site": "none",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
