// Everything an action test needs: the temporary database, the fake sign-in service wired to it
// (a new account writes auth.users, so the sign-up trigger runs for real), a movable clock,
// and helpers to build requests the way a browser on our own site sends them.
import { FakeAuth } from "@/lib/server/auth/fake";
import type { Deps } from "@/lib/server/deps";
import { createTestDb, type TestDb } from "../db/harness";

export const OWN_ORIGIN = "http://localhost:3000";

export type TestApp = {
  db: TestDb;
  auth: FakeAuth;
  deps: Deps;
  /**
   * Everything an account action could change: rows in auth.users and the app tables, the fake's
   * accounts (confirmed, password), e-mails sent and the session. Compare before and after a rejection.
   */
  snapshot(): Promise<Record<string, unknown>>;
  /** Empties the database and the fake sign-in service. Call it in beforeEach. */
  reset(): Promise<void>;
  /** Moves the fake clock forward. */
  advance(ms: number): void;
  close(): Promise<void>;
};

export async function createTestApp(): Promise<TestApp> {
  const db = await createTestDb();
  let now = Date.parse("2026-11-16T09:00:00Z");
  const auth = new FakeAuth({
    now: () => now,
    onUserCreated: async ({ id, email, timeZone }) => {
      await db.createUser(email, { id, timeZone });
    },
  });
  return {
    db,
    auth,
    deps: { auth, withUser: db.withUser },
    async snapshot() {
      const users = await db.admin("select id, email from auth.users order by email");
      const profiles = await db.admin("select * from app.profiles order by id");
      const settings = await db.admin("select * from app.settings order by user_id");
      return {
        users,
        profiles,
        settings,
        accounts: auth.accounts(),
        emails: [...auth.outbox],
        session: auth.session && { ...auth.session },
      };
    },
    async reset() {
      auth.reset();
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
