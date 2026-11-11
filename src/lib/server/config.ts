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

/** Connection string of the database (Supabase transaction pooler). A secret. */
export function databaseUrl(): string {
  return required("DATABASE_URL");
}
