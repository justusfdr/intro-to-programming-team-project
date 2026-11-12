import "server-only";

// connect_outlook (ontology section 5, R26): Microsoft's sign-in with the authorization code and PKCE.
//   start:    POST from our calendar (same origin, signed in) → a short sealed cookie with `state` and the
//             PKCE verifier, bound to this user → 303 to Microsoft.
//   callback: GET from Microsoft → the cookie is cleared first; then the same signed-in user, the cookie
//             under 10 minutes old, the same `state`, a working code exchange, a refresh token and the
//             write scope → the refresh token is saved encrypted. Anything else: nothing saved.
// Where the browser goes afterwards is fixed (APP_URL + "/?outlook=connected" or "=failed"); nothing in
// the request chooses it.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Deps } from "@/lib/server/deps";
import { appUrl } from "@/lib/server/config";
import { assertSameOrigin } from "@/lib/server/http";
import { open, seal, signInPurpose, tokenPurpose } from "@/lib/server/outlook/box";
import type { OutlookDeps } from "@/lib/server/outlook/sync";
import { grantsCalendarWrite } from "@/lib/server/outlook/types";

export const SIGN_IN_COOKIE = "outlook_sign_in";
const COOKIE_PATH = "/api/outlook";
export const SIGN_IN_MAX_AGE_S = 600;

/** PKCE (RFC 7636): a 43-character verifier and its S256 challenge. */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function cookieHeader(value: string, maxAge: number): string {
  const secure = appUrl().startsWith("https:") ? "; Secure" : "";
  return `${SIGN_IN_COOKIE}=${value}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function redirect(to: string, cookie: string): Response {
  return new Response(null, { status: 303, headers: { Location: to, "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}

const back = (result: "connected" | "failed") => `${appUrl()}/?outlook=${result}`;

function readCookie(request: Request): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SIGN_IN_COOKIE) return rest.join("=");
  }
  return null;
}

export async function startOutlookSignIn(request: Request, deps: Pick<Deps, "auth" | "now">, outlook: OutlookDeps): Promise<Response> {
  const denied = assertSameOrigin(request);
  if (denied) return denied;
  const userId = await deps.auth.currentUserId();
  if (!userId) return redirect(`${appUrl()}/sign-in`, cookieHeader("", 0));
  if (!outlook) return redirect(back("failed"), cookieHeader("", 0));

  const state = randomBytes(32).toString("base64url");
  const { verifier, challenge } = createPkce();
  const sealed = seal(JSON.stringify({ state, verifier, at: deps.now().getTime() }), signInPurpose(userId), outlook.key);
  return redirect(outlook.service.authorizeUrl({ state, challenge }), cookieHeader(sealed, SIGN_IN_MAX_AGE_S));
}

export async function finishOutlookSignIn(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">, outlook: OutlookDeps): Promise<Response> {
  // The cookie is used once, whatever happens next.
  const clear = cookieHeader("", 0);
  const failed = () => redirect(back("failed"), clear);

  const userId = await deps.auth.currentUserId();
  const sealed = readCookie(request);
  if (!userId || !outlook || !sealed) return failed();

  const plain = open(sealed, signInPurpose(userId), outlook.key);
  let saved: { state?: unknown; verifier?: unknown; at?: unknown } = {};
  try {
    saved = plain ? JSON.parse(plain) : {};
  } catch {
    return failed();
  }
  const params = new URL(request.url).searchParams;
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  const age = deps.now().getTime() - (typeof saved.at === "number" ? saved.at : 0);
  if (
    typeof saved.state !== "string" ||
    typeof saved.verifier !== "string" ||
    age < 0 ||
    age > SIGN_IN_MAX_AGE_S * 1000 ||
    !sameText(state, saved.state) ||
    params.has("error") ||
    code === "" ||
    code.length > 4000
  ) {
    return failed();
  }

  const answer = await outlook.service.exchangeCode({ code, verifier: saved.verifier });
  // R26: read and write at once; declined (or only part of it) means not connected.
  if (answer.kind !== "ok" || !answer.refreshToken || !grantsCalendarWrite(answer.scope)) return failed();

  const token = seal(answer.refreshToken, tokenPurpose(userId), outlook.key);
  await deps.withUser(userId, (q) => q("select app.outlook_connect($1)", [token]));
  return redirect(back("connected"), clear);
}
