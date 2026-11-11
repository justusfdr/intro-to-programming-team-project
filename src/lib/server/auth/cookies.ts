import "server-only";

// Where session cookies are read and written, and the one rule for how they are written.
// The browser never talks to Supabase, so no page script needs the session cookies:
// they are always HttpOnly, SameSite=Lax, and Secure when the app runs on https.
// Only the writing changes; @supabase/ssr reads the cookies by name, whatever their options.
import type { CookieOptions } from "./supabase";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/server/config";

/** Where the session cookies are read from and written to (the request and the answer). */
export interface CookieJar {
  getAll(): { name: string; value: string }[];
  /** `headers` are cache headers that must go on the same answer, so no cache keeps someone's cookies. */
  setAll(cookies: { name: string; value: string; options: CookieOptions }[], headers: Record<string, string>): void;
}

/** The options every session cookie is written with, whatever the library asked for. */
export function sessionCookieOptions(options: CookieOptions = {}): CookieOptions {
  return { ...options, httpOnly: true, sameSite: "lax", secure: appUrl().startsWith("https://") };
}

/** Cookie jar for route handlers: Next.js's cookie store of the current request. */
export function storeCookieJar(store: {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options: CookieOptions): unknown;
}): CookieJar {
  return {
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll(cookies) {
      // Cache headers are not needed here: every answer of a route handler is "no-store".
      for (const { name, value, options } of cookies) store.set(name, value, sessionCookieOptions(options));
    },
  };
}

/**
 * Cookie jar for the proxy. Pattern from the @supabase/ssr documentation: refreshed cookies go to the
 * request (so pages see them) and to the answer (so the browser keeps them). `response()` gives the
 * answer that carries them; call it after the session was read.
 */
export function proxyCookieJar(request: NextRequest): { jar: CookieJar; response: () => NextResponse } {
  let response = NextResponse.next({ request });
  const jar: CookieJar = {
    getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    setAll(cookies, headers) {
      for (const { name, value } of cookies) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of cookies) response.cookies.set(name, value, sessionCookieOptions(options));
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    },
  };
  return { jar, response: () => response };
}
