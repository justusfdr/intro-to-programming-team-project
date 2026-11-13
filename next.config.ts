import type { NextConfig } from "next";

// Security headers for every answer. The content security policy has no script rules yet
// (those need nonces); it covers what is safe without them.
const securityHeaders = [
  // Never show our pages inside another site's frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone for the spoken chat input later (R24); no camera, no location.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  // Browsers ignore this on http://localhost; on the deployed https site it keeps them on https.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // The download of the Chrome extension reads the project's `extension` folder at run time (spec 18).
  outputFileTracingIncludes: { "/api/extension/download": ["./extension/**/*"] },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
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
