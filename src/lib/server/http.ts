import "server-only";

// Small helpers for route handlers: JSON answers, the same-origin check and reading a JSON body with zod.
import type { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { appUrl } from "./config";

/** Largest request body we read, in bytes. Account forms are tiny; later steps may pass a larger limit. */
export const MAX_BODY_BYTES = 16 * 1024;

/** The shape of every error answer: a short code for programs and the message for people. */
export type ApiError = { error: string; message: string };

const NO_STORE = { "Cache-Control": "no-store" };

/** Error answer in the fixed shape { error, message }. */
export function jsonError(status: number, error: string, message: string): Response {
  const body: ApiError = { error, message };
  return Response.json(body, { status, headers: NO_STORE });
}

/** Success answer. Never cached, because it belongs to one user. */
export function jsonOk(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function forbidden(): Response {
  return jsonError(403, "forbidden", MESSAGES.forbidden);
}

/**
 * The app's own address (APP_URL). Deliberately not taken from request.url:
 * that comes from the Host header, which an attacker can choose.
 */
function ownBase(): URL {
  try {
    return new URL(appUrl());
  } catch {
    return new URL("http://localhost:3000");
  }
}

/** Allowed origins: the app's address, plus 127.0.0.1 when it runs on localhost. */
function allowedOrigins(): Set<string> {
  const base = ownBase();
  const origins = new Set([base.origin]);
  if (base.hostname === "localhost") {
    const alt = new URL(base.href);
    alt.hostname = "127.0.0.1";
    origins.add(alt.origin);
  }
  return origins;
}

function allowedHosts(): Set<string> {
  return new Set([...allowedOrigins()].map((origin) => new URL(origin).host.toLowerCase()));
}

/**
 * Lets a request through only if its Host header is the app's own address.
 * Protects against DNS rebinding: a foreign domain pointing at our server sends its own Host.
 * Returns an error answer, or null when everything is fine.
 */
export function checkHost(request: Request): Response | null {
  const host = request.headers.get("host")?.trim().toLowerCase();
  if (!host || !allowedHosts().has(host)) return forbidden();
  return null;
}

/**
 * Same-origin check for every request that changes data (protection against cross-site requests):
 * - the Host header must be our own address;
 * - if Sec-Fetch-Site is sent, it must be same-origin (or none, for a typed address);
 * - the Origin header must be our own; without Origin we accept only Sec-Fetch-Site same-origin.
 * Returns an error answer, or null when everything is fine.
 */
export function assertSameOrigin(request: Request): Response | null {
  const hostDenied = checkHost(request);
  if (hostDenied) return hostDenied;

  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return forbidden();

  const origin = request.headers.get("origin");
  if (origin === null) {
    // Browsers always send Origin with a JSON POST. Without it, accept only a clearly same-origin request.
    return site === "same-origin" ? null : forbidden();
  }
  if (!allowedOrigins().has(origin)) return forbidden();
  return null;
}

type BodyRead = { kind: "ok"; text: string } | { kind: "too_large" } | { kind: "error" };

/** Reads the body, but stops as soon as it grows beyond `limit` bytes. Also used for Stripe's raw messages. */
export async function readLimitedText(request: Request, limit: number): Promise<BodyRead> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return { kind: "too_large" };
  if (!request.body) return { kind: "ok", text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return { kind: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: "error" };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: "ok", text: new TextDecoder().decode(bytes) };
}

/**
 * Reads the JSON body (at most `limit` bytes) and checks its shape with `schema`.
 * The schema checks only the shape (types, required fields). Rules with their own ontology message,
 * such as "Password needs at least 8 characters", are checked afterwards in the action itself.
 */
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  limit = MAX_BODY_BYTES,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
  const read = await readLimitedText(request, limit);
  if (read.kind === "too_large") {
    return { ok: false, response: jsonError(413, "too_large", MESSAGES.tooLarge) };
  }
  if (read.kind === "error") {
    return { ok: false, response: jsonError(400, "bad_request", MESSAGES.badRequest) };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(read.text);
  } catch {
    return { ok: false, response: jsonError(400, "bad_request", MESSAGES.badRequest) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: jsonError(400, "bad_request", MESSAGES.badRequest) };
  }
  return { ok: true, data: parsed.data };
}
