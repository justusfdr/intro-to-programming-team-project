import "server-only";

// What an action needs from the outside world. Route handlers pass the real ones (realDeps);
// tests pass the fake sign-in service and the temporary database instead.
import { cookies } from "next/headers";
import { storeCookieJar } from "./auth/cookies";
import { createSupabaseAuth } from "./auth/supabase";
import type { AuthService } from "./auth/types";
import { claudeAssistant } from "./claude/client";
import type { Assistant } from "./claude/types";
import { billingStore, withUser, type BillingStore, type WithUser } from "./db";
import { realStripe } from "./stripe/client";
import type { Stripe } from "./stripe/types";

export type Deps = {
  auth: AuthService;
  withUser: WithUser;
  /** The current time. Tests pass a clock they can move. */
  now: () => Date;
  /** Claude, for the coach (spec 19); null when ANTHROPIC_API_KEY is not set on this server. */
  assistant: Assistant | null;
  /** Stripe, for Pro (spec 24); null when it is not set up on this server or not in test mode (R25). */
  stripe: Stripe | null;
  /** Writes a user's plan for a verified message from Stripe (R6). */
  billing: BillingStore;
};

/** The real services for the current request. Call it inside a route handler. */
export async function realDeps(): Promise<Deps> {
  return {
    auth: createSupabaseAuth(storeCookieJar(await cookies())),
    withUser,
    now: () => new Date(),
    assistant: claudeAssistant(),
    stripe: realStripe(),
    billing: billingStore,
  };
}

/**
 * The real services for a page (server component). Pages may not set cookies; the proxy has
 * already refreshed the session before the page runs, so the cookie jar only reads.
 */
export async function pageDeps(): Promise<Deps> {
  return {
    auth: createSupabaseAuth(storeCookieJar(await cookies(), { readOnly: true })),
    withUser,
    now: () => new Date(),
    assistant: claudeAssistant(),
    stripe: realStripe(),
    billing: billingStore,
  };
}
