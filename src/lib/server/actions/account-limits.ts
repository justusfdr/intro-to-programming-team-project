import "server-only";

// Rate limits of the account actions (Issue #46): sign_in, sign_up, request_password_reset and
// resend_confirmation. Per e-mail address (lower case), at most 10 sign-ins and 5 of each of the others
// per 15 minutes; per client address, at most 30 of all four together per 15 minutes. Over a limit the
// answer is 429 "Too many attempts. Try again in a few minutes." Each action checks after its
// same-origin check and input check and before it asks the sign-in service; the limit does not depend on
// whether an account exists, so the answer reveals nothing about the address.
//
// Honest limit: the counts live in this server's memory (rate-limit.ts). On a serverless host each
// instance counts on its own and starts at zero, so this slows abuse down; the sign-in service's own
// limits stay the real backstop. The client address is the first entry of X-Forwarded-For as the host
// sets it; a client that fakes the header only gets fresh client buckets, the per-address limit still holds.
import { MESSAGES } from "@/lib/messages";
import { ActionError } from "@/lib/server/errors";
import { createLimiter, takeAll, type Limiter } from "@/lib/server/rate-limit";

export type AccountAction = "sign_in" | "sign_up" | "request_password_reset" | "resend_confirmation";

const WINDOW_MS = 15 * 60_000;

const perEmail: Record<AccountAction, Limiter> = {
  sign_in: createLimiter({ limit: 10, windowMs: WINDOW_MS }),
  sign_up: createLimiter({ limit: 5, windowMs: WINDOW_MS }),
  request_password_reset: createLimiter({ limit: 5, windowMs: WINDOW_MS }),
  resend_confirmation: createLimiter({ limit: 5, windowMs: WINDOW_MS }),
};
const perClient = createLimiter({ limit: 30, windowMs: WINDOW_MS });

/** The client's address: the first entry of X-Forwarded-For, else one shared "unknown" bucket. */
export function clientAddress(request: Request): string {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first.slice(0, 100) : "unknown";
}

/** Counts one attempt, or refuses it with 429 when the address or the client is over its limit. */
export function checkAccountAttempt(request: Request, action: AccountAction, email: string, now: Date): void {
  const allowed = takeAll(
    [
      [perEmail[action], email.toLowerCase()],
      [perClient, clientAddress(request)],
    ],
    now.getTime(),
  );
  if (!allowed) throw new ActionError(429, "too_many_attempts", MESSAGES.tooManyAttempts);
}

// invite_contact (spec 28): a cheap extra brake in memory, before the database's own limits (10 per
// hour per sender, counted in the database). Per user at most 20 and per client address at most 30
// invitations per 15 minutes. Like the limits above, it never depends on the invited address.
const invitesPerUser = createLimiter({ limit: 20, windowMs: WINDOW_MS });
const invitesPerClient = createLimiter({ limit: 30, windowMs: WINDOW_MS });

/** Counts one invitation, or refuses it with 429 when the user or the client is over its limit. */
export function checkInviteAttempt(request: Request, userId: string, now: Date): void {
  const allowed = takeAll(
    [
      [invitesPerUser, userId],
      [invitesPerClient, clientAddress(request)],
    ],
    now.getTime(),
  );
  if (!allowed) throw new ActionError(429, "too_many_attempts", MESSAGES.tooManyAttempts);
}
