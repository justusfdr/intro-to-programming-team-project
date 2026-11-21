// Spec 45 at the front door: the proxy lets a signed-out visitor through to the landing page and the
// legal notes, and to nothing else. Supabase is not configured here, so everyone counts as signed out.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proxy } from "./proxy";

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

describe("proxy and the pages for visitors", () => {
  it("lets a signed-out visitor through to /home and /legal", async () => {
    for (const path of ["/home", "/legal", "/home?from=mail"]) {
      const response = await proxy(get(path));
      expect(response.headers.get("x-middleware-next"), path).toBe("1");
      expect(response.headers.get("location"), path).toBeNull();
      expect(response.status, path).toBe(200);
    }
  });

  it("still sends a signed-out visitor of the calendar and of anything below /home to the sign-in page", async () => {
    for (const path of ["/goals", "/home/anything", "/legal/terms"]) {
      const response = await proxy(get(path));
      expect(response.status, path).toBe(307);
      expect(response.headers.get("location"), path).toBe(`${ORIGIN}/sign-in`);
    }
  });

  // Spec 63 (changed on 21 Nov 2026): the bare address used to be in the list above.
  it("sends a signed-out visitor of the bare address / to the landing page", async () => {
    const response = await proxy(get("/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/home`);
  });
});
