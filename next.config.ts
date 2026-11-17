import type { NextConfig } from "next";

// Security headers for every answer. The content security policy has no script rules yet
// (those need nonces); it covers what is safe without them.
const securityHeaders = [
  // Never show our pages inside another site's frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    // form-action: our own forms, and Microsoft's sign-in, which "Sign in with Microsoft" posts to
    // through our server's redirect (browsers apply form-action to the redirect as well).
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://login.microsoftonline.com; object-src 'none'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone for the spoken chat input later (R24). Location for the weather widget, only on our own
  // pages and only when the user clicks the location sign (R48). No camera.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self)" },
  // Browsers ignore this on http://localhost; on the deployed https site it keeps them on https.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// The profile photo (spec 40) is served as an image that can never run as a page. The route sets the same
// policy itself; this entry comes after the general one, so it replaces the general policy on that
// address whichever of the two the framework applies last.
const photoHeaders = [{ key: "Content-Security-Policy", value: "default-src 'none'; sandbox; frame-ancestors 'none'" }];

/** The general headers, exported for test/repo/security-headers.test.ts. */
export const SECURITY_HEADERS = securityHeaders;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // The download of the Chrome extension reads the project's `extension` folder at run time (spec 18).
  outputFileTracingIncludes: { "/api/extension/download": ["./extension/**/*"] },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/api/profiles/:id/photo", headers: photoHeaders },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
