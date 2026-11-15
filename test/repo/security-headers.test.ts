// The security headers of every answer (next.config.ts): the general policy stays as it was, and the
// profile photo's address (spec 40) gets its own stricter policy on top.
import { describe, expect, it } from "vitest";
import nextConfig, { SECURITY_HEADERS } from "../../next.config";

const policyOf = (headers: readonly { key: string; value: string }[]) => headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
const directives = (policy: string) =>
  Object.fromEntries(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name, values];
      }),
  );

describe("security headers", () => {
  it("keeps the general policy: no framing of our pages, base, forms, objects", () => {
    expect(directives(policyOf(SECURITY_HEADERS))).toEqual({
      "frame-ancestors": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'", "https://login.microsoftonline.com"],
      "object-src": ["'none'"],
    });
    expect(SECURITY_HEADERS.find((h) => h.key === "X-Frame-Options")?.value).toBe("DENY");
    expect(SECURITY_HEADERS.find((h) => h.key === "X-Content-Type-Options")?.value).toBe("nosniff");
  });

  it("sends the general headers on every address and the photo's own stricter policy on the photo", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual({ source: "/(.*)", headers: SECURITY_HEADERS });
    expect(rules[1].source).toBe("/api/profiles/:id/photo");
    expect(policyOf(rules[1].headers)).toBe("default-src 'none'; sandbox; frame-ancestors 'none'");
  });
});
