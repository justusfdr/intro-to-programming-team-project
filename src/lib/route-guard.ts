// Which addresses need a signed-in user (R3). Used by src/proxy.ts before every request.
// This is the first check only: every route handler checks the session again itself (requireUser).

/** Account pages: reachable without signing in. */
export const ACCOUNT_PAGES = [
  "/sign-up",
  "/sign-in",
  "/check-email",
  "/auth/confirm",
  "/forgot-password",
  "/reset-password",
] as const;

/** Server addresses of the account actions (sign_up, sign_in, sign_out, …): no sign-in needed. */
const ACCOUNT_API = "/api/auth";

/**
 * Stripe's messages to our server (spec 24). Stripe has no session; the route checks Stripe's
 * signature itself and changes nothing without it.
 */
export const STRIPE_WEBHOOK = "/api/billing/webhook";

export const SIGN_IN_PAGE = "/sign-in";

export type GuardDecision = { kind: "allow" } | { kind: "redirect"; to: string } | { kind: "unauthorized" };

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isPublic(pathname: string): boolean {
  return pathname === STRIPE_WEBHOOK || matches(pathname, ACCOUNT_API) || ACCOUNT_PAGES.some((page) => matches(pathname, page));
}

/**
 * The framework's own addresses in development: the hot-reload websocket (/_next/webpack-hmr) and the
 * error overlay's helpers (/__nextjs_…). They carry no user data. Sent to the sign-in page, they only
 * fill the browser console with errors while signed out. In production they are not let through here.
 */
export function isDevFrameworkPath(pathname: string): boolean {
  return pathname.startsWith("/_next/") || pathname.startsWith("/__nextjs");
}

/**
 * Without a session: pages go to the sign-in page, data requests get 401.
 * `development`: true only while running `next dev`; then the framework's own addresses pass.
 */
export function guard(pathname: string, signedIn: boolean, options: { development?: boolean } = {}): GuardDecision {
  if (signedIn || isPublic(pathname)) return { kind: "allow" };
  if (options.development && isDevFrameworkPath(pathname)) return { kind: "allow" };
  if (matches(pathname, "/api")) return { kind: "unauthorized" };
  return { kind: "redirect", to: SIGN_IN_PAGE };
}
