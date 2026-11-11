import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { assertSameOrigin, checkHost, MAX_BODY_BYTES, readJson } from "./http";

const OWN = "http://localhost:3000";

function post(init: { headers?: Record<string, string>; body?: string } = {}): Request {
  return new Request(`${OWN}/api/example`, {
    method: "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: init.body ?? JSON.stringify({ ok: true }),
  });
}

const schema = z.object({ ok: z.boolean() });

describe("assertSameOrigin", () => {
  const saved = process.env.APP_URL;
  beforeEach(() => {
    delete process.env.APP_URL;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = saved;
  });

  it("lets a request from our own pages through", () => {
    const r = post({ headers: { origin: OWN, host: "localhost:3000", "sec-fetch-site": "same-origin" } });
    expect(assertSameOrigin(r)).toBeNull();
  });

  it("rejects a POST without Origin (a script outside the browser)", () => {
    expect(assertSameOrigin(post({ headers: { host: "localhost:3000" } }))?.status).toBe(403);
  });

  it("accepts a POST without Origin only with Sec-Fetch-Site same-origin", () => {
    const r = post({ headers: { host: "localhost:3000", "sec-fetch-site": "same-origin" } });
    expect(assertSameOrigin(r)).toBeNull();
  });

  it("rejects a foreign Origin", () => {
    const r = post({ headers: { origin: "https://evil.example", host: "localhost:3000" } });
    expect(assertSameOrigin(r)?.status).toBe(403);
  });

  it("rejects DNS rebinding: foreign Host with a matching Origin", () => {
    const r = post({ headers: { origin: "http://evil.example:3000", host: "evil.example:3000" } });
    expect(assertSameOrigin(r)?.status).toBe(403);
  });

  it("rejects a foreign Host header even without Origin", () => {
    const r = post({ headers: { host: "evil.example", "sec-fetch-site": "same-origin" } });
    expect(assertSameOrigin(r)?.status).toBe(403);
  });

  it("rejects Sec-Fetch-Site cross-site", () => {
    const r = post({ headers: { origin: OWN, host: "localhost:3000", "sec-fetch-site": "cross-site" } });
    expect(assertSameOrigin(r)?.status).toBe(403);
  });

  it("accepts 127.0.0.1 as the local address of the app", () => {
    const r = post({ headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" } });
    expect(assertSameOrigin(r)).toBeNull();
  });

  it("uses APP_URL as the app's own address", () => {
    process.env.APP_URL = "https://app.example.org/";
    const ok = post({ headers: { origin: "https://app.example.org", host: "app.example.org" } });
    expect(assertSameOrigin(ok)).toBeNull();
    const other = post({ headers: { origin: OWN, host: "localhost:3000" } });
    expect(assertSameOrigin(other)?.status).toBe(403);
  });
});

describe("checkHost", () => {
  it("lets our own host through and rejects others", () => {
    const own = new Request(`${OWN}/api/status`, { headers: { host: "localhost:3000" } });
    const other = new Request(`${OWN}/api/status`, { headers: { host: "evil.example:3000" } });
    expect(checkHost(own)).toBeNull();
    expect(checkHost(other)?.status).toBe(403);
  });
});

describe("readJson", () => {
  it("reads valid JSON", async () => {
    expect(await readJson(post(), schema)).toEqual({ ok: true, data: { ok: true } });
  });

  it("answers 400 for broken JSON and for the wrong shape", async () => {
    const broken = await readJson(post({ body: "{not json" }), schema);
    expect(broken.ok ? 200 : broken.response.status).toBe(400);
    const wrong = await readJson(post({ body: JSON.stringify({ ok: "yes" }) }), schema);
    expect(wrong.ok ? 200 : wrong.response.status).toBe(400);
  });

  it("answers 413 when Content-Length is over the limit", async () => {
    const r = await readJson(post({ headers: { "content-length": String(MAX_BODY_BYTES + 1) }, body: "{}" }), schema);
    expect(r.ok ? 200 : r.response.status).toBe(413);
  });

  it("answers 413 for a streamed body over the limit without Content-Length", async () => {
    const big = JSON.stringify({ ok: true, pad: "x".repeat(MAX_BODY_BYTES + 10) });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const r = await readJson(
      new Request(`${OWN}/api/example`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: OWN },
        body: stream,
        duplex: "half",
      } as RequestInit),
      schema,
    );
    expect(r.ok ? 200 : r.response.status).toBe(413);
  });
});
