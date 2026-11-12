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
