import "server-only";

// What an action needs from the outside world. Route handlers pass the real ones (realDeps);
// tests pass the fake sign-in service and the temporary database instead.
import { cookies } from "next/headers";
import { storeCookieJar } from "./auth/cookies";
import { createSupabaseAuth } from "./auth/supabase";
import type { AuthService } from "./auth/types";
import { withUser, type WithUser } from "./db";

export type Deps = {
  auth: AuthService;
  withUser: WithUser;
};

/** The real services for the current request. Call it inside a route handler. */
export async function realDeps(): Promise<Deps> {
  return { auth: createSupabaseAuth(storeCookieJar(await cookies())), withUser };
}
