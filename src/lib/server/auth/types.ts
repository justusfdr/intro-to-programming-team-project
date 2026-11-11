import "server-only";

// The sign-in service as our actions see it. Two implementations:
// - supabase.ts talks to Supabase Auth (production);
// - fake.ts keeps everything in memory (tests; no network, no secret).
// Actions receive an AuthService and never import Supabase themselves.

/** Which kind of e-mail link the user opened (ontology: confirm_email and reset_password). */
export type LinkKind = "confirm" | "reset";

export type SignUpResult =
  | { kind: "created" } // account unconfirmed, confirmation link sent
  | { kind: "email_taken" }
  | { kind: "email_failed" }; // the confirmation e-mail could not be sent; nothing created

export type SignInResult = { kind: "signed_in" } | { kind: "wrong_credentials" } | { kind: "unconfirmed" };

/** "sent" also covers "nothing to send" (unknown or already confirmed email): the answer stays neutral (R30). */
export type ResendResult = { kind: "sent" } | { kind: "too_soon" } | { kind: "email_failed" };

export type LinkResult = { kind: "ok" } | { kind: "expired" };

export type UpdatePasswordResult = { kind: "ok" } | { kind: "no_session" };

export interface AuthService {
  /** Creates an unconfirmed account and sends the confirmation link. The time zone is already checked. */
  signUp(input: { email: string; password: string; timeZone: string }): Promise<SignUpResult>;
  /** Signs in and sets the session cookies. */
  signIn(input: { email: string; password: string }): Promise<SignInResult>;
  /** Ends the session and clears the session cookies. */
  signOut(): Promise<void>;
  /** The signed-in user's id, checked with Supabase's signing keys; null when signed out. */
  currentUserId(): Promise<string | null>;
  /** Sends the confirmation link again, at most once per 60 seconds per email (R30). */
  resendConfirmation(email: string): Promise<ResendResult>;
  /** Sends a reset link to a registered email; unknown emails get nothing. Never tells which (R30). */
  requestPasswordReset(email: string): Promise<{ kind: "sent" } | { kind: "email_failed" }>;
  /** Uses the link from the e-mail once. On success the user is signed in (reset: for setting the new password). */
  verifyLink(input: { tokenHash: string; kind: LinkKind }): Promise<LinkResult>;
  /** Saves a new password for the signed-in user (after a reset link). The length is already checked. */
  updatePassword(newPassword: string): Promise<UpdatePasswordResult>;
}

/** A failure of the sign-in service itself (down, misconfigured). Mapped to a neutral message. */
export class AuthUnavailableError extends Error {
  constructor(detail: string) {
    super(`The sign-in service is not available: ${detail}`);
    this.name = "AuthUnavailableError";
  }
}
