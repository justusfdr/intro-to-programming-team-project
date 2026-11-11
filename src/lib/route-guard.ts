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

export const SIGN_IN_PAGE = "/sign-in";

export type GuardDecision = { kind: "allow" } | { kind: "redirect"; to: string } | { kind: "unauthorized" };

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isPublic(pathname: string): boolean {
  return matches(pathname, ACCOUNT_API) || ACCOUNT_PAGES.some((page) => matches(pathname, page));
}

/** Without a session: pages go to the sign-in page, data requests get 401. */
export function guard(pathname: string, signedIn: boolean): GuardDecision {
  if (signedIn || isPublic(pathname)) return { kind: "allow" };
  if (matches(pathname, "/api")) return { kind: "unauthorized" };
  return { kind: "redirect", to: SIGN_IN_PAGE };
}
