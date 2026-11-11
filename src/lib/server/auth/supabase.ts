import "server-only";

// The Supabase Auth module: the only place that calls Supabase.
// Sessions live in cookies managed by @supabase/ssr. The browser never talks to Supabase itself;
// the publishable key stays on the server.
//
// Supabase project settings this code relies on (docs/setup.md): e-mail confirmation on,
// minimum password length 8, "secure password change" off, and e-mail templates that link to
// /auth/confirm with token_hash and type (server-side flow).
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { AuthError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "@/lib/server/config";
import {
  AuthUnavailableError,
  type AuthService,
  type LinkResult,
  type ResendResult,
  type SignInResult,
  type SignUpResult,
  type UpdatePasswordResult,
} from "./types";

/** Where the session cookies are read from and written to (the request and the answer). */
export interface CookieJar {
  getAll(): { name: string; value: string }[];
  /** `headers` are cache headers that must go on the same answer, so no cache keeps someone's cookies. */
  setAll(cookies: { name: string; value: string; options: CookieOptions }[], headers: Record<string, string>): void;
}

function client(jar: CookieJar) {
  const { url, publishableKey } = supabaseConfig();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookies, headers) => jar.setAll(cookies, headers),
    },
  });
}

function isServerError(error: AuthError): boolean {
  return (error.status ?? 500) >= 500;
}

function unavailable(error: AuthError): AuthUnavailableError {
  // Code and status only: messages could contain the email address.
  return new AuthUnavailableError(`${error.code ?? "no code"} (${error.status ?? "no status"})`);
}

/**
 * For the proxy (runs before every page): refreshes an expiring session and returns the signed-in
 * user's id together with the answer that carries the refreshed cookies.
 * Pattern from the @supabase/ssr documentation: refreshed cookies go to the request (so pages see
 * them) and to the answer (so the browser keeps them).
 */
export async function refreshSession(request: NextRequest): Promise<{ response: NextResponse; userId: string | null }> {
  let response = NextResponse.next({ request });
  const jar: CookieJar = {
    getAll: () => request.cookies.getAll(),
    setAll(cookies, headers) {
      for (const { name, value } of cookies) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    },
  };
  const userId = await createSupabaseAuth(jar).currentUserId();
  return { response, userId };
}

/** The real sign-in service for one request, reading and writing session cookies through `jar`. */
export function createSupabaseAuth(jar: CookieJar): AuthService {
  // Created on first use, so a missing configuration surfaces inside the action (as a neutral answer).
  let cached: ReturnType<typeof client> | null = null;
  const supabase = () => (cached ??= client(jar));

  return {
    async signUp({ email, password, timeZone }): Promise<SignUpResult> {
      // The time zone travels as user metadata; the database trigger copies it into app.settings.
      const { data, error } = await supabase().auth.signUp({ email, password, options: { data: { time_zone: timeZone } } });
      if (error) {
        if (error.code === "user_already_exists" || error.code === "email_exists") return { kind: "email_taken" };
        if (error.code === "over_email_send_rate_limit" || isServerError(error)) return { kind: "email_failed" };
        throw unavailable(error);
      }
      if (data.session) {
        // Only happens when e-mail confirmation is switched off in Supabase, which our rules forbid.
        await supabase().auth.signOut({ scope: "local" });
        throw new AuthUnavailableError("e-mail confirmation is switched off in the Supabase project");
      }
      // With confirmation on, Supabase hides an existing confirmed account behind a user without identities.
      if (!data.user || (data.user.identities ?? []).length === 0) return { kind: "email_taken" };
      return { kind: "created" };
    },

    async signIn({ email, password }): Promise<SignInResult> {
      const { error } = await supabase().auth.signInWithPassword({ email, password });
      if (!error) return { kind: "signed_in" };
      if (error.code === "invalid_credentials") return { kind: "wrong_credentials" };
      if (error.code === "email_not_confirmed") return { kind: "unconfirmed" };
      throw unavailable(error);
    },

    async signOut() {
      // "local": ends this browser's session only, and always clears its cookies.
      await supabase().auth.signOut({ scope: "local" });
    },

    async currentUserId() {
      // getClaims checks the token's signature; never trust getSession() on the server.
      const { data, error } = await supabase().auth.getClaims();
      if (error || !data) return null;
      return typeof data.claims.sub === "string" ? data.claims.sub : null;
    },

    async resendConfirmation(email): Promise<ResendResult> {
      const { error } = await supabase().auth.resend({ type: "signup", email });
      if (!error) return { kind: "sent" };
      if (error.code === "over_email_send_rate_limit") return { kind: "too_soon" };
      if (isServerError(error)) return { kind: "email_failed" };
      // Any other refusal (unknown or confirmed email) gets the neutral answer (R30).
      return { kind: "sent" };
    },

    async requestPasswordReset(email) {
      const { error } = await supabase().auth.resetPasswordForEmail(email);
      if (error && isServerError(error)) return { kind: "email_failed" };
      // Always neutral otherwise, also when Supabase limits the rate (R30).
      return { kind: "sent" };
    },

    async verifyLink({ tokenHash, kind }): Promise<LinkResult> {
      const { error } = await supabase().auth.verifyOtp({
        token_hash: tokenHash,
        type: kind === "confirm" ? "email" : "recovery",
      });
      if (!error) return { kind: "ok" };
      if (isServerError(error)) throw unavailable(error);
      return { kind: "expired" };
    },

    async updatePassword(newPassword): Promise<UpdatePasswordResult> {
      const { data } = await supabase().auth.getClaims();
      if (!data) return { kind: "no_session" };
      const { error } = await supabase().auth.updateUser({ password: newPassword });
      // "same_password": nothing to change, the password is already this one.
      if (!error || error.code === "same_password") return { kind: "ok" };
      if (error.code === "session_not_found" || error.code === "session_expired") return { kind: "no_session" };
      throw unavailable(error);
    },
  };
}
