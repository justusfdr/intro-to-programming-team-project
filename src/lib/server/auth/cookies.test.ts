// Session cookies are always HttpOnly and SameSite=Lax, and Secure when the app runs on https.
// The last block drives the real Supabase server client (with a stubbed network) through both jars,
// to prove it still reads and refreshes the session with these options.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxyCookieJar, sessionCookieOptions, storeCookieJar } from "./cookies";
import { createSupabaseAuth } from "./supabase";

const saved = { ...process.env };

beforeEach(() => {
  process.env.APP_URL = "http://localhost:3000";
  process.env.SUPABASE_URL = "https://testref.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_placeholder";
});

afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

// What @supabase/ssr asks for by default (its DEFAULT_COOKIE_OPTIONS): note httpOnly false.
const LIBRARY_DEFAULTS = { path: "/", sameSite: "lax" as const, httpOnly: false, maxAge: 400 * 24 * 60 * 60 };

/** A fake Next.js cookie store that records what is written. */
function recordingStore(initial: { name: string; value: string }[] = []) {
  const cookies = new Map(initial.map((c) => [c.name, { value: c.value, options: {} as Record<string, unknown> }]));
  return {
    cookies,
    getAll: () => [...cookies].map(([name, c]) => ({ name, value: c.value })),
    set(name: string, value: string, options: Record<string, unknown>) {
      cookies.set(name, { value, options });
    },
  };
}

describe("sessionCookieOptions", () => {
  it("forces HttpOnly and SameSite=Lax over the library's defaults, without Secure on http://localhost", () => {
    expect(sessionCookieOptions(LIBRARY_DEFAULTS)).toEqual({
      path: "/",
      maxAge: LIBRARY_DEFAULTS.maxAge,
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });
  });

  it("adds Secure when the app address is https", () => {
    process.env.APP_URL = "https://app.example.org";
    expect(sessionCookieOptions({ ...LIBRARY_DEFAULTS, sameSite: "none" })).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
  });
});

describe("both cookie jars write hardened cookies", () => {
  it.each([
    ["http://localhost:3000", false],
    ["https://app.example.org", true],
  ])("route handler jar (APP_URL %s): HttpOnly, Secure %s", (appUrl, secure) => {
    process.env.APP_URL = appUrl;
    const store = recordingStore();
    storeCookieJar(store).setAll([{ name: "sb-testref-auth-token", value: "v", options: LIBRARY_DEFAULTS }], {});
    expect(store.cookies.get("sb-testref-auth-token")?.options).toMatchObject({ httpOnly: true, sameSite: "lax", secure });
  });

  it.each([
    ["http://localhost:3000", false],
    ["https://app.example.org", true],
  ])("proxy jar (APP_URL %s): HttpOnly, Secure %s", (appUrl, secure) => {
    process.env.APP_URL = appUrl;
    const { jar, response } = proxyCookieJar(new NextRequest("http://localhost:3000/"));
    jar.setAll([{ name: "sb-testref-auth-token", value: "v", options: LIBRARY_DEFAULTS }], { "Cache-Control": "private, no-store" });
    const header = response().headers.get("set-cookie") ?? "";
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(/;\s*Secure/i.test(header)).toBe(secure);
    expect(response().headers.get("cache-control")).toBe("private, no-store");
  });
});

// ---- the real Supabase server client, with the network stubbed ----

const USER_ID = "11111111-1111-4111-8111-111111111111";
const COOKIE = "sb-testref-auth-token";

function base64url(text: string): string {
  return Buffer.from(text).toString("base64url");
}

/** An unsigned test token with symmetric algorithm: the client then asks /user to vouch for it (stubbed). */
function accessToken(expiresAt: number): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ sub: USER_ID, aud: "authenticated", role: "authenticated", exp: expiresAt, iat: expiresAt - 3600 }),
  );
  return `${header}.${payload}.${base64url("test-signature")}`;
}

function sessionCookieValue(expiresAt: number, refreshToken: string): string {
  const session = {
    access_token: accessToken(expiresAt),
    refresh_token: refreshToken,
    expires_at: expiresAt,
    expires_in: expiresAt - Math.floor(Date.now() / 1000),
    token_type: "bearer",
    user: { id: USER_ID, aud: "authenticated", role: "authenticated", email: "ana@example.com" },
  };
  return `base64-${base64url(JSON.stringify(session))}`;
}

/** Stubs Supabase Auth: a refresh returns a fresh session; /user vouches for any token. */
function stubSupabase() {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(new URL(url).pathname + new URL(url).search);
    const user = { id: USER_ID, aud: "authenticated", role: "authenticated", email: "ana@example.com" };
    if (url.includes("/auth/v1/token")) {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      return Response.json({
        access_token: accessToken(expiresAt),
        refresh_token: "new-refresh-token",
        expires_in: 3600,
        expires_at: expiresAt,
        token_type: "bearer",
        user,
      });
    }
    if (url.includes("/auth/v1/user")) return Response.json(user);
    return Response.json({ message: "not stubbed" }, { status: 404 });
  });
  return calls;
}

const expired = () => Math.floor(Date.now() / 1000) - 60;

describe("the Supabase server client with hardened cookies", () => {
  it("route handler jar: refreshes an expired session, writes HttpOnly cookies, and reads them back", async () => {
    process.env.APP_URL = "https://app.example.org";
    const calls = stubSupabase();
    const store = recordingStore([{ name: COOKIE, value: sessionCookieValue(expired(), "old-refresh-token") }]);

    expect(await createSupabaseAuth(storeCookieJar(store)).currentUserId()).toBe(USER_ID);
    await vi.waitFor(() => expect(store.cookies.get(COOKIE)?.options).toMatchObject({ httpOnly: true, secure: true }));
    expect(calls.some((c) => c.includes("grant_type=refresh_token"))).toBe(true);

    // A new request carrying only the refreshed cookies reads the session without another refresh.
    const next = recordingStore(store.getAll());
    const before = calls.filter((c) => c.includes("/token")).length;
    expect(await createSupabaseAuth(storeCookieJar(next)).currentUserId()).toBe(USER_ID);
    expect(calls.filter((c) => c.includes("/token")).length).toBe(before);
  });

  it("proxy jar: refreshes an expired session and the answer sets HttpOnly cookies", async () => {
    stubSupabase();
    const request = new NextRequest("http://localhost:3000/", {
      headers: { cookie: `${COOKIE}=${sessionCookieValue(expired(), "old-refresh-token")}` },
    });
    const { jar, response } = proxyCookieJar(request);

    expect(await createSupabaseAuth(jar).currentUserId()).toBe(USER_ID);
    await vi.waitFor(() => expect(response().headers.get("set-cookie") ?? "").toMatch(/HttpOnly/i));
    const cookies = response().cookies.getAll().filter((c) => c.name.startsWith(COOKIE));
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax" });
  });
});
