// The security headers of every answer (next.config.ts). Spec 35 had added one frame source for the
// event preview's map; spec 38 took the map away again, so the policy names no frame source at all, and
// our own pages still never show inside a frame.
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
  it("names no frame source (spec 38: no map in the event preview any more)", () => {
    const policy = directives(policyOf(SECURITY_HEADERS));
    expect(policy["frame-src"]).toBeUndefined();
    expect(policyOf(SECURITY_HEADERS)).not.toContain("openstreetmap");
    // No default-src or child-src that would widen or narrow frames another way.
    expect(policy["default-src"]).toBeUndefined();
    expect(policy["child-src"]).toBeUndefined();
  });

  it("keeps every other directive as it was: no framing of our pages, base, forms, objects", () => {
    const policy = directives(policyOf(SECURITY_HEADERS));
    expect(policy).toEqual({
      "frame-ancestors": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'", "https://login.microsoftonline.com"],
      "object-src": ["'none'"],
    });
    expect(SECURITY_HEADERS.find((h) => h.key === "X-Frame-Options")?.value).toBe("DENY");
  });

  it("sends the general headers on every address and the photo's own stricter policy on the photo", async () => {
    const rules = await nextConfig.headers!();
    expect(rules[0]).toEqual({ source: "/(.*)", headers: SECURITY_HEADERS });
    const photo = rules.find((r) => r.source === "/api/profiles/:id/photo");
    expect(policyOf(photo!.headers)).toBe("default-src 'none'; sandbox; frame-ancestors 'none'");
  });
});
