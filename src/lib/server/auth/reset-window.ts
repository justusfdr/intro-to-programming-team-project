import "server-only";

// The rule of reset_password: only a session that a reset link created, and only shortly after.
// Shared by the real service (reading the signed token's "amr" claim) and the fake.

/** How long after opening the reset link the new password may be set. */
export const RESET_WINDOW_SECONDS = 15 * 60;
// Small allowance for clocks that differ between our server and Supabase's.
const CLOCK_SKEW_SECONDS = 60;

/** Supabase Auth's name for the method "signed in through a password-reset link". */
export const RECOVERY_METHOD = "recovery";

/**
 * True when `amr` (the token's "Authentication Method References") holds a "recovery" entry whose
 * timestamp is at most 15 minutes old. Fails closed: the plain string format has no timestamp and
 * never counts; anything malformed never counts.
 */
export function isFreshResetSession(amr: unknown, nowSeconds: number): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (method !== RECOVERY_METHOD || typeof timestamp !== "number" || !Number.isFinite(timestamp)) return false;
    const age = nowSeconds - timestamp;
    return age <= RESET_WINDOW_SECONDS && age >= -CLOCK_SKEW_SECONDS;
  });
}
