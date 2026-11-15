// The security headers of every answer (next.config.ts). Spec 35 adds one frame source: OpenStreetMap's
// embedded map in the event preview, and nothing else; our own pages still never show inside a frame.
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
  it("allows exactly one frame source, OpenStreetMap over https, and nothing else", () => {
    const policy = directives(policyOf(SECURITY_HEADERS));
    expect(policy["frame-src"]).toEqual(["https://www.openstreetmap.org"]);
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
      "frame-src": ["https://www.openstreetmap.org"],
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
