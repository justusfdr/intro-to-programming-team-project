import "server-only";

// What an action needs from the outside world. Route handlers pass the real ones (realDeps);
// tests pass the fake sign-in service and the temporary database instead.
import { cookies } from "next/headers";
import { createSupabaseAuth, type CookieJar } from "./auth/supabase";
import type { AuthService } from "./auth/types";
import { withUser, type WithUser } from "./db";

export type Deps = {
  auth: AuthService;
  withUser: WithUser;
};

/** The real services for the current request. Call it inside a route handler. */
export async function realDeps(): Promise<Deps> {
  const store = await cookies();
  const jar: CookieJar = {
    getAll: () => store.getAll(),
    setAll(list) {
      // Route handlers may set cookies. Cache headers are not needed: every answer is "no-store".
      for (const { name, value, options } of list) store.set(name, value, options);
    },
  };
  return { auth: createSupabaseAuth(jar), withUser };
}
