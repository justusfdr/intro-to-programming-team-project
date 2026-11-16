import "server-only";

// Reads the server's environment variables. Values are never logged or sent to the browser.
// The names are listed in .env.example.

function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

function required(name: string): string {
  const value = read(name);
  if (!value) throw new MissingConfigError(name);
  return value;
}

export class MissingConfigError extends Error {
  constructor(name: string) {
    super(`The environment variable ${name} is not set.`);
    this.name = "MissingConfigError";
  }
}

/** The app's own public address, without a trailing slash. Used for the same-origin check. */
export function appUrl(): string {
  return (read("APP_URL") || "http://localhost:3000").replace(/\/+$/, "");
}

/** Supabase project address and its publishable key. Used only on the server. */
export function supabaseConfig(): { url: string; publishableKey: string } {
  return { url: required("SUPABASE_URL"), publishableKey: required("SUPABASE_PUBLISHABLE_KEY") };
}

/** True when the Supabase variables are set (the proxy treats a missing config as "signed out"). */
export function supabaseConfigured(): boolean {
  return read("SUPABASE_URL") !== "" && read("SUPABASE_PUBLISHABLE_KEY") !== "";
}

/**
 * The id of our Chrome extension. Not a secret: it follows from the public key in
 * extension/manifest.json. Set EXTENSION_ID only if that key is ever replaced.
 */
export const DEFAULT_EXTENSION_ID = "dghmihlicabdooieaknglfjlidpjjfki";

export function extensionId(): string {
  return read("EXTENSION_ID") || DEFAULT_EXTENSION_ID;
}

/** Connection string of the database (Supabase transaction pooler). A secret. */
export function databaseUrl(): string {
  return required("DATABASE_URL");
}

/**
 * Optional: the certificate authority (PEM) that signed the database server's certificate
 * (docs/setup.md, section 6). With it the server's certificate is verified; without it the
 * connection is still encrypted. Not a secret, but it lives with the other settings.
 */
export function databaseCaCert(): string | undefined {
  return read("DATABASE_CA_CERT") || undefined;
}

/** The app registration at Microsoft (docs/setup.md). Null when it is not set up: Outlook is then off. */
export function microsoftConfig(): { clientId: string; clientSecret: string; tenant: string } | null {
  const clientId = read("MICROSOFT_CLIENT_ID");
  const clientSecret = read("MICROSOFT_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  // "common": personal accounts and work or school accounts.
  return { clientId, clientSecret, tenant: read("MICROSOFT_TENANT") || "common" };
}

/**
 * The key that encrypts the stored Outlook access (base64, at least 32 bytes). A secret.
 * Null when it is missing or too short: Outlook is then off.
 */
export function outlookTokenKey(): Buffer | null {
  const raw = read("OUTLOOK_TOKEN_KEY");
  if (!raw) return null;
  const bytes = Buffer.from(raw, "base64");
  return bytes.length >= 32 ? bytes : null;
}

/** True when Outlook can be connected on this server: the app registration and the key are both set. */
export function outlookConfigured(): boolean {
  return microsoftConfig() !== null && outlookTokenKey() !== null;
}

/**
 * The Claude API (docs/setup.md, section 10). The key is a secret: read only here, never logged, never
 * sent to the browser. Null when the key is not set: the coach then answers every message with
 * "The assistant is not available right now. Your calendar is unchanged".
 */
export function anthropicConfig(): { apiKey: string; model: string } | null {
  const apiKey = read("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  return { apiKey, model: read("ANTHROPIC_MODEL") || DEFAULT_ANTHROPIC_MODEL };
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

export type StripeConfig = { secretKey: string; webhookSecret: string; priceId: string };

/**
 * Stripe, for Pro (spec 24, docs/setup.md section 11). The secret key and the webhook secret are
 * secrets: read only here, never logged, never sent to the browser. Null when anything is missing:
 * payment is then off ("Payment is not available right now.").
 * R25: test mode only. A secret key that does not start with "sk_test_" is not used, and the error is
 * logged (without the key).
 */
export function stripeConfig(): StripeConfig | null {
  const secretKey = read("STRIPE_SECRET_KEY");
  const webhookSecret = read("STRIPE_WEBHOOK_SECRET");
  const priceId = read("STRIPE_PRICE_ID");
  if (!secretKey || !webhookSecret || !priceId) return null;
  if (!secretKey.startsWith("sk_test_")) {
    console.error("STRIPE_SECRET_KEY is not a test-mode key (sk_test_…). Payment stays off (R25).");
    return null;
  }
  return { secretKey, webhookSecret, priceId };
}

/**
 * R21: "true" makes the coach Pro only, as the ontology says. Anything else (or unset): every signed-in
 * user may use it, until Free and Pro are built.
 */
export function chatProOnly(): boolean {
  return read("CHAT_PRO_ONLY").toLowerCase() === "true";
}

/**
 * Google's server key for Places (and later Routes). A secret; it only ever lives on the server. Null when
 * it is not set: address and city search then say they are not available.
 */
export function googleMapsServerKey(): string | null {
  return read("GOOGLE_MAPS_SERVER_KEY") || null;
}
