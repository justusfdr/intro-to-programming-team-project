// The database connection is always encrypted, whatever the connection string says, except for a
// database on this computer. With DATABASE_CA_CERT the server's certificate is verified.
import { describe, expect, it } from "vitest";
import { connectionOptions, InvalidCaCertError, isLocalDatabase, readCaCert, UNVERIFIED_WARNING } from "./options";

const REMOTE = "postgresql://postgres.ref:secret-password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
const PEM = "-----BEGIN CERTIFICATE-----\nMIIDxTCCAq2gAwIBAgIBADANBgkqhkiG9w0BAQsFADB8\n-----END CERTIFICATE-----";

describe("connectionOptions", () => {
  it("encrypts a remote connection without a certificate authority, unverified", () => {
    const { options, protection } = connectionOptions(REMOTE, undefined);
    expect(options.ssl).toBe("require");
    expect(protection).toBe("encrypted_unverified");
  });

  it("encrypts even when the connection string asks for no encryption", () => {
    for (const url of [`${REMOTE}?sslmode=disable`, `${REMOTE}?sslmode=prefer`, `${REMOTE}?sslmode=allow`]) {
      // The explicit option is what the library uses; the string's sslmode does not count.
      expect(connectionOptions(url, undefined).options.ssl, url).toBe("require");
    }
  });

  it("verifies the server's certificate against DATABASE_CA_CERT when it is set", () => {
    const { options, protection } = connectionOptions(REMOTE, PEM);
    expect(options.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
    expect(protection).toBe("verified");
    // No custom check that could skip the host name: Node's default check compares it.
    expect(Object.keys(options.ssl as object).sort()).toEqual(["ca", "rejectUnauthorized"]);
  });

  it("accepts the certificate with written-out \\n line breaks, as environment files often hold it", () => {
    const oneLine = PEM.replace(/\n/g, "\\n");
    expect(connectionOptions(REMOTE, oneLine).options.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it("refuses a DATABASE_CA_CERT that is not a certificate instead of silently not verifying", () => {
    expect(() => connectionOptions(REMOTE, "not a certificate")).toThrow(InvalidCaCertError);
  });

  it("leaves a database on this computer as it was: no ssl option", () => {
    for (const url of [
      "postgres://postgres:postgres@localhost:54322/postgres",
      "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
      "postgres://postgres@[::1]:5432/postgres",
    ]) {
      const { options, protection } = connectionOptions(url, undefined);
      expect(options.ssl, url).toBeUndefined();
      expect(protection, url).toBe("local");
    }
  });

  it("keeps the pooler settings: no prepared statements, few connections, idle ones kept for minutes", () => {
    const { options } = connectionOptions(REMOTE, undefined);
    expect(options.prepare).toBe(false);
    expect(options.max).toBe(3);
    expect(options.idle_timeout).toBe(300);
    expect(options.connect_timeout).toBe(10);
  });

  it("never puts the connection string or its password into the warning", () => {
    expect(UNVERIFIED_WARNING).not.toContain("secret-password");
    expect(UNVERIFIED_WARNING).not.toContain("pooler.supabase.com");
    expect(UNVERIFIED_WARNING).toContain("DATABASE_CA_CERT");
  });
});

describe("isLocalDatabase", () => {
  it("counts only localhost, 127.0.0.1 and ::1 as local; look-alikes and unreadable strings are remote", () => {
    expect(isLocalDatabase("postgres://u:p@localhost/db")).toBe(true);
    expect(isLocalDatabase("postgres://u:p@LOCALHOST/db")).toBe(true);
    expect(isLocalDatabase("postgres://u:p@localhost.evil.example/db")).toBe(false);
    expect(isLocalDatabase("postgres://u:p@127.0.0.2/db")).toBe(false);
    expect(isLocalDatabase("postgres://u:p@localhost:5432,db.example.com:5432/db")).toBe(false);
    expect(isLocalDatabase("not a url")).toBe(false);
    expect(isLocalDatabase("http://localhost/db")).toBe(false);
  });
});

describe("readCaCert", () => {
  it("is null when the variable is empty or missing", () => {
    expect(readCaCert(undefined)).toBeNull();
    expect(readCaCert("   ")).toBeNull();
  });
});
