import "server-only";

// How the app connects to Postgres: turns the configuration into the database library's options.
// A pure function (no network), so it can be tested on its own.
//
// Encryption is decided here, in code, and not left to the connection string: an explicit `ssl`
// option wins over any `sslmode` in the string (the library reads the option first), so a string
// without `sslmode=require`, or with `sslmode=disable`, still gets an encrypted connection.

/** The options we pass to the library (a subset of postgres.Options). */
export type ConnectionOptions = {
  prepare: false;
  max: number;
  idle_timeout: number;
  connect_timeout: number;
  /** Absent only for a database on this computer: then the connection string decides, as before. */
  ssl?: "require" | { ca: string; rejectUnauthorized: true };
};

/** What kind of protection the connection gets, for the one log line and for tests. */
export type Protection = "local" | "verified" | "encrypted_unverified";

export class InvalidCaCertError extends Error {
  constructor() {
    super("DATABASE_CA_CERT is set but does not hold a certificate in PEM form (-----BEGIN CERTIFICATE-----).");
    this.name = "InvalidCaCertError";
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * True only when the connection string clearly names a database on this computer. Anything that
 * cannot be read (several hosts, an unusual form) counts as remote, so it gets encrypted.
 */
export function isLocalDatabase(databaseUrl: string): boolean {
  try {
    const url = new URL(databaseUrl);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return false;
    if (url.hostname.includes(",")) return false;
    return LOCAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * The certificate authority from DATABASE_CA_CERT, or null when it is not set. Environment files
 * often hold the PEM on one line with "\n" written out; those become real line breaks.
 * A value that is set but is not a certificate stops the connection (better than silently not verifying).
 */
export function readCaCert(raw: string | undefined): string | null {
  const value = (raw ?? "").trim().replace(/\\n/g, "\n");
  if (!value) return null;
  if (!value.includes("-----BEGIN CERTIFICATE-----") || !value.includes("-----END CERTIFICATE-----")) {
    throw new InvalidCaCertError();
  }
  return value;
}

/**
 * The library's options for this configuration:
 * - a database on localhost or 127.0.0.1: no `ssl` option (nothing changes for local work and tests);
 * - with a certificate authority: encrypted, and the server's certificate is checked against it,
 *   including the host name (the library passes the host as the expected name);
 * - without one: encrypted ("require"), but the certificate is not checked.
 */
export function connectionOptions(databaseUrl: string, caCertRaw: string | undefined): { options: ConnectionOptions; protection: Protection } {
  const options: ConnectionOptions = {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    // At most 3 connections per server process. One page or action uses one connection at a time
    // (its queries travel together on it), so 3 cover a page, an action and a background re-read.
    // A serverless deployment runs many processes; keeping each small keeps the pooler's client
    // limit far away.
    max: 3,
    // Keep an idle connection for 5 minutes. Opening one costs several round trips (network,
    // encryption, sign-in), so closing it after 20 seconds made the next click after a short pause
    // slow. 5 minutes covers a working session on a long-running server; a serverless process that
    // is frozen or ended loses its connections anyway, and the library opens a new one when needed.
    idle_timeout: 300,
    // Give up after 10 seconds when the database cannot be reached (ontology section 7).
    connect_timeout: 10,
  };
  if (isLocalDatabase(databaseUrl)) return { options, protection: "local" };

  const ca = readCaCert(caCertRaw);
  if (ca) return { options: { ...options, ssl: { ca, rejectUnauthorized: true } }, protection: "verified" };
  return { options: { ...options, ssl: "require" }, protection: "encrypted_unverified" };
}

/** The one line the server logs when the connection is encrypted but not verified. Never the connection string. */
export const UNVERIFIED_WARNING =
  "Database connection: encrypted, but the server's certificate is not verified. Set DATABASE_CA_CERT (docs/setup.md, section 6) to verify it.";
