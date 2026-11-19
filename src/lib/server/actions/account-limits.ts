import "server-only";

// Rate limits of the account actions (Issue #46, spec 50): sign_in, sign_up, request_password_reset and
// resend_confirmation, each window 15 minutes. Over a limit the answer is 429 "Too many attempts. Try
// again in a few minutes." Each action checks after its same-origin check and input check and before it
// asks the sign-in service; the limit does not depend on whether an account exists, so the answer
// reveals nothing about the address.
//
// - Per client address: at most 30 of all four actions together.
// - sign_up, request_password_reset, resend_confirmation: at most 5 per e-mail address.
// - sign_in (spec 50): only WRONG passwords count, so somebody else cannot lock a person out by typing
//   wrong passwords for their address. At most 10 wrong passwords per e-mail address from one client;
//   from another client the person can still sign in. At most 50 wrong passwords per e-mail address
//   from all clients together, the brake against guessing one password from many machines.
//
// Honest limit: the counts live in this server's memory (rate-limit.ts). On a serverless host each
// instance counts on its own and starts at zero, so this slows abuse down; the sign-in service's own
// limits stay the real backstop. The client address is the first entry of X-Forwarded-For as the host
// sets it; a client that fakes the header only gets fresh client buckets, the limit of 50 still holds.
import { MESSAGES } from "@/lib/messages";
import { ActionError } from "@/lib/server/errors";
import { createLimiter, takeAll, type Limiter } from "@/lib/server/rate-limit";

export type AccountAction = "sign_in" | "sign_up" | "request_password_reset" | "resend_confirmation";

const WINDOW_MS = 15 * 60_000;

const perEmail: Record<Exclude<AccountAction, "sign_in">, Limiter> = {
  sign_up: createLimiter({ limit: 5, windowMs: WINDOW_MS }),
  request_password_reset: createLimiter({ limit: 5, windowMs: WINDOW_MS }),
  resend_confirmation: createLimiter({ limit: 5, windowMs: WINDOW_MS }),
};
const perClient = createLimiter({ limit: 30, windowMs: WINDOW_MS });

/** Wrong passwords for one address from one client, and for one address from all clients. */
const wrongPasswordsFromClient = createLimiter({ limit: 10, windowMs: WINDOW_MS });
const wrongPasswordsForAddress = createLimiter({ limit: 50, windowMs: WINDOW_MS });

/** The client's address: the first entry of X-Forwarded-For, else one shared "unknown" bucket. */
export function clientAddress(request: Request): string {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first.slice(0, 100) : "unknown";
}

function tooMany(): ActionError {
  return new ActionError(429, "too_many_attempts", MESSAGES.tooManyAttempts);
}

/** Counts one attempt, or refuses it with 429 when the address or the client is over its limit. */
export function checkAccountAttempt(request: Request, action: AccountAction, email: string, now: Date): void {
  const address = email.toLowerCase();
  const client = clientAddress(request);
  const at = now.getTime();

  if (action === "sign_in") {
    // Wrong passwords are counted later (countWrongPassword); here they only stop a new try.
    const blocked =
      !wrongPasswordsFromClient.allows(`${client} ${address}`, at) || !wrongPasswordsForAddress.allows(address, at);
    if (blocked || !takeAll([[perClient, client]], at)) throw tooMany();
    return;
  }

  if (!takeAll([[perEmail[action], address], [perClient, client]], at)) throw tooMany();
}

/** sign_in only: counts one wrong password for this address from this client (spec 50). */
export function countWrongPassword(request: Request, email: string, now: Date): void {
  const address = email.toLowerCase();
  const at = now.getTime();
  wrongPasswordsFromClient.count(`${clientAddress(request)} ${address}`, at);
  wrongPasswordsForAddress.count(address, at);
}

// invite_contact (spec 28): a cheap extra brake in memory, before the database's own limits (10 per
// hour per sender, counted in the database). Per user at most 20 invitations per 15 minutes. There is no
// bucket per client address: the user is signed in, and a shared address (a campus network) must not let
// one person block the invitations of everyone else behind it (security review L2). Like the limits
// above, it never depends on the invited address. The request stays a parameter so callers need not change.
const invitesPerUser = createLimiter({ limit: 20, windowMs: WINDOW_MS });

/** Counts one invitation, or refuses it with 429 when the user is over their limit. */
export function checkInviteAttempt(request: Request, userId: string, now: Date): void {
  const allowed = takeAll([[invitesPerUser, userId]], now.getTime());
  if (!allowed) throw new ActionError(429, "too_many_attempts", MESSAGES.tooManyAttempts);
}
