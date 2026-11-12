// Proof of R3 at the front door: the proxy runs before every page and data request. Without a sign-in
// a page goes to the sign-in page, a data request gets 401 and no data. Supabase is not configured here,
// so everyone counts as signed out and no network call happens.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";

const saved = { ...process.env };
const ORIGIN = "http://localhost:3000";

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
});

afterEach(() => {
  process.env = { ...saved };
});

function get(path: string): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`);
}

describe("proxy (R3: not signed in gets the sign-in page or 401, no data)", () => {
  it("redirects a signed-out visitor of / to the sign-in page (307)", async () => {
    const response = await proxy(get("/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/sign-in`);
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it("answers 401 with only error and message to a signed-out data request, with no data", async () => {
    const response = await proxy(get("/api/anything"));
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
    expect(body).toEqual({ error: "unauthorized", message: "Please sign in." });
  });

  it("lets the account pages and the account actions through without a sign-in", async () => {
    for (const path of ["/sign-in", "/sign-up", "/api/auth/sign-in"]) {
      const response = await proxy(get(path));
      expect(response.headers.get("x-middleware-next"), path).toBe("1");
      expect(response.status, path).toBe(200);
    }
  });

  it("does not skip /api in the matcher, so the guard sees every data request", () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test("/api/anything")).toBe(true);
    expect(pattern.test("/")).toBe(true);
  });
});

describe("proxy and the framework's own addresses (development websocket)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets the hot-reload websocket and the error overlay through in development, signed out", async () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const path of ["/_next/webpack-hmr", "/_next/webpack-hmr?id=abc", "/__nextjs_original-stack-frames"]) {
      const response = await proxy(get(path));
      expect(response.headers.get("x-middleware-next"), path).toBe("1");
      expect(response.headers.get("location"), path).toBeNull();
    }
  });

  it("still sends pages and data requests to sign-in or 401 in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await proxy(get("/"))).headers.get("location")).toBe(`${ORIGIN}/sign-in`);
    expect((await proxy(get("/api/tasks"))).status).toBe(401);
    // Only the exact prefix counts, not a look-alike page.
    expect((await proxy(get("/_nextish"))).headers.get("location")).toBe(`${ORIGIN}/sign-in`);
  });

  it("changes nothing in production: the same addresses still go to the sign-in page", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const path of ["/_next/webpack-hmr", "/__nextjs_original-stack-frames", "/_next/data/build/index.json"]) {
      const response = await proxy(get(path));
      expect(response.status, path).toBe(307);
      expect(response.headers.get("location"), path).toBe(`${ORIGIN}/sign-in`);
    }
  });
});
