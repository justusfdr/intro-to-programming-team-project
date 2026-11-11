import "server-only";

// In-memory sign-in service for tests. It behaves like our Supabase setup (e-mail confirmation on,
// links valid for one hour and usable once, at most one e-mail per address every 60 seconds),
// but sends nothing: e-mails land in `outbox`, where tests can read the links.
// One FakeAuth stands for the sign-in server plus one browser (its `session`).
import { randomBytes, randomUUID } from "node:crypto";
import type {
  AuthService,
  LinkKind,
  LinkResult,
  ResendResult,
  SignInResult,
  SignUpResult,
  UpdatePasswordResult,
} from "./types";
import { isFreshResetSession, RECOVERY_METHOD } from "./reset-window";

const LINK_LIFETIME_MS = 60 * 60 * 1000;
const EMAIL_INTERVAL_MS = 60 * 1000;

type FakeUser = { id: string; email: string; password: string; confirmed: boolean };
type FakeLink = { userId: string; kind: LinkKind; expiresAt: number; used: boolean };

export type SentEmail = { to: string; kind: LinkKind; tokenHash: string };

/** How a session was created, like the "amr" claim of a Supabase token. */
export type SessionMethod = "password" | "confirm_link" | "reset_link";

/** The fake browser's session: whose it is, how and when (milliseconds) it was created. */
export type FakeSession = { userId: string; method: SessionMethod; createdAt: number };

// The "amr" method names Supabase uses for each way in (setup.md step 8 confirms "recovery").
const AMR_METHOD: Record<SessionMethod, string> = {
  password: "password",
  confirm_link: "otp",
  reset_link: RECOVERY_METHOD,
};

export type FakeAuthOptions = {
  /** Clock in milliseconds; tests move it forward to pass the 60-second limit or expire links. */
  now?: () => number;
  /** Called when an account is created, before it counts as created. Tests use it to write auth.users. */
  onUserCreated?: (user: { id: string; email: string; timeZone: string }) => Promise<void>;
};

export class FakeAuth implements AuthService {
  readonly outbox: SentEmail[] = [];
  /** When true, sending e-mail fails (like the e-mail service being down). */
  emailDown = false;
  /** The session of this fake browser, or null when signed out. */
  session: FakeSession | null = null;

  private readonly users = new Map<string, FakeUser>();
  private readonly links = new Map<string, FakeLink>();
  private readonly lastEmailAt = new Map<string, number>();
  private readonly now: () => number;
  private readonly onUserCreated?: FakeAuthOptions["onUserCreated"];

  constructor(options: FakeAuthOptions = {}) {
    this.now = options.now ?? Date.now;
    this.onUserCreated = options.onUserCreated;
  }

  // ---- helpers for tests ----

  /** Forgets all accounts, links, e-mails and the session. */
  reset() {
    this.users.clear();
    this.links.clear();
    this.lastEmailAt.clear();
    this.outbox.length = 0;
    this.session = null;
    this.emailDown = false;
  }

  /** Adds an account directly, e.g. an already confirmed one. Returns its id. */
  async addUser(email: string, password: string, options: { confirmed?: boolean; timeZone?: string } = {}) {
    const id = randomUUID();
    await this.onUserCreated?.({ id, email, timeZone: options.timeZone ?? "Europe/Lisbon" });
    this.users.set(email, { id, email, password, confirmed: options.confirmed ?? false });
    return id;
  }

  /** The newest link of this kind sent to `email`, or undefined. */
  lastLink(email: string, kind: LinkKind): SentEmail | undefined {
    return this.outbox.filter((mail) => mail.to === email && mail.kind === kind).at(-1);
  }

  isConfirmed(email: string): boolean {
    return this.users.get(email)?.confirmed ?? false;
  }

  hasUser(email: string): boolean {
    return this.users.has(email);
  }

  // ---- AuthService ----

  async signUp(input: { email: string; password: string; timeZone: string }): Promise<SignUpResult> {
    const existing = this.users.get(input.email);
    if (existing?.confirmed) return { kind: "email_taken" };
    if (this.emailDown) return { kind: "email_failed" };

    if (existing) {
      // Like Supabase: signing up again with an unconfirmed email sends a new link and creates nothing.
      this.sendLink(existing, "confirm");
      return { kind: "created" };
    }
    const id = randomUUID();
    await this.onUserCreated?.({ id, email: input.email, timeZone: input.timeZone });
    const user = { id, email: input.email, password: input.password, confirmed: false };
    this.users.set(input.email, user);
    this.sendLink(user, "confirm");
    return { kind: "created" };
  }

  async signIn(input: { email: string; password: string }): Promise<SignInResult> {
    const user = this.users.get(input.email);
    if (!user || user.password !== input.password) return { kind: "wrong_credentials" };
    if (!user.confirmed) return { kind: "unconfirmed" };
    this.startSession(user.id, "password");
    return { kind: "signed_in" };
  }

  async signOut(): Promise<void> {
    this.session = null;
  }

  async currentUserId(): Promise<string | null> {
    return this.session?.userId ?? null;
  }

  async resendConfirmation(email: string): Promise<ResendResult> {
    // The 60-second limit counts every request for this address, known or not, so the answer
    // does not reveal whether an account exists (R30).
    const last = this.lastEmailAt.get(email);
    if (last !== undefined && this.now() - last < EMAIL_INTERVAL_MS) return { kind: "too_soon" };
    if (this.emailDown) return { kind: "email_failed" };
    this.lastEmailAt.set(email, this.now());
    const user = this.users.get(email);
    if (user && !user.confirmed) this.sendLink(user, "confirm", false);
    return { kind: "sent" };
  }

  async requestPasswordReset(email: string): Promise<{ kind: "sent" } | { kind: "email_failed" }> {
    if (this.emailDown) return { kind: "email_failed" };
    const user = this.users.get(email);
    if (user) this.sendLink(user, "reset");
    return { kind: "sent" };
  }

  async verifyLink(input: { tokenHash: string; kind: LinkKind }): Promise<LinkResult> {
    const link = this.links.get(input.tokenHash);
    if (!link || link.used || link.kind !== input.kind || this.now() >= link.expiresAt) {
      return { kind: "expired" };
    }
    link.used = true;
    const user = [...this.users.values()].find((u) => u.id === link.userId);
    if (!user) return { kind: "expired" };
    if (link.kind === "confirm") user.confirmed = true;
    this.startSession(user.id, link.kind === "confirm" ? "confirm_link" : "reset_link");
    return { kind: "ok" };
  }

  async updatePassword(newPassword: string): Promise<UpdatePasswordResult> {
    // Same rule as the real service, applied to what the token's "amr" claim would say.
    const session = this.session;
    const amr = session ? [{ method: AMR_METHOD[session.method], timestamp: session.createdAt / 1000 }] : undefined;
    const user = [...this.users.values()].find((u) => u.id === session?.userId);
    if (!user || !isFreshResetSession(amr, this.now() / 1000)) return { kind: "link_expired" };
    user.password = newPassword;
    // Like the real service: every session of the account ends.
    this.session = null;
    return { kind: "ok" };
  }

  private startSession(userId: string, method: SessionMethod) {
    this.session = { userId, method, createdAt: this.now() };
  }

  private sendLink(user: FakeUser, kind: LinkKind, countForLimit = true) {
    const tokenHash = randomBytes(16).toString("hex");
    this.links.set(tokenHash, { userId: user.id, kind, expiresAt: this.now() + LINK_LIFETIME_MS, used: false });
    this.outbox.push({ to: user.email, kind, tokenHash });
    if (countForLimit) this.lastEmailAt.set(user.email, this.now());
  }
}
