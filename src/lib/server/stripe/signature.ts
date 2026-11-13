import "server-only";

// Checks that a message really comes from Stripe (R25: the plan changes only on Stripe's signed
// message). Stripe sends the header `Stripe-Signature: t=<seconds>,v1=<hex>[,v1=<hex>…]`; v1 is the
// HMAC-SHA256 of "<t>.<the raw body>" with our webhook secret. A message older (or newer) than five
// minutes is refused, so a recorded message cannot be sent again later.
// Pure: no network, no database. The tests sign their own messages with signPayload().
import { createHmac, timingSafeEqual } from "node:crypto";
import type { StripeEvent } from "./types";

/** How far the signature's time may be from ours, in seconds (Stripe's own default). */
export const TOLERANCE_SECONDS = 300;

function hmac(secret: string, timestamp: number, payload: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

/** The header Stripe would send for this body at this time. Used by the tests and the fake. */
export function signPayload(payload: string, secret: string, at: Date): string {
  const timestamp = Math.floor(at.getTime() / 1000);
  return `t=${timestamp},v1=${hmac(secret, timestamp, payload)}`;
}

function sameHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/.test(a) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** True when one of the header's v1 signatures matches and its time is within the tolerance. */
export function validSignature(payload: string, header: string | null, secret: string, now: Date): boolean {
  if (!header || !secret) return false;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((s) => s?.trim() ?? "");
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  if (timestamp === null || signatures.length === 0) return false;
  if (Math.abs(Math.floor(now.getTime() / 1000) - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = hmac(secret, timestamp, payload);
  return signatures.some((signature) => sameHex(signature, expected));
}

/** The event in a signed body, or null when the signature is wrong or the body is not an event. */
export function verifyEvent(payload: string, header: string | null, secret: string, now: Date): StripeEvent | null {
  if (!validSignature(payload, header, secret, now)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const event = parsed as Record<string, unknown>;
  const data = event.data as Record<string, unknown> | undefined;
  const object = data?.object;
  if (typeof event.id !== "string" || typeof event.type !== "string" || typeof event.livemode !== "boolean") return null;
  if (typeof object !== "object" || object === null || Array.isArray(object)) return null;
  return { id: event.id, type: event.type, livemode: event.livemode, object: object as Record<string, unknown> };
}
