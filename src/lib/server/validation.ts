import "server-only";

// Input rules shared by several actions. Each check throws an ActionError with the user's message.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { ActionError } from "./errors";

export const DEFAULT_TIME_ZONE = "Europe/Lisbon";
const MIN_PASSWORD_CHARACTERS = 8;
// Supabase Auth (bcrypt) uses at most 72 bytes of a password; we refuse longer ones instead of cutting them.
const MAX_PASSWORD_BYTES = 72;

const emailSchema = z.email().max(254);

/** Trims and lower-cases an email address and checks its form. */
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) throw new ActionError(400, "invalid_email", MESSAGES.invalidEmail);
  return email;
}

/** A new password: at least 8 characters (ontology), at most 72 bytes (Supabase's limit). */
export function checkNewPassword(password: string): void {
  if ([...password].length < MIN_PASSWORD_CHARACTERS) {
    throw new ActionError(400, "password_too_short", MESSAGES.passwordTooShort);
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    throw new ActionError(400, "password_too_long", MESSAGES.passwordTooLong);
  }
}

/** The browser's time zone if it is a real IANA name, else Europe/Lisbon (ontology, settings). */
export function resolveTimeZone(raw: string | undefined): string {
  if (!raw || raw.length > 64) return DEFAULT_TIME_ZONE;
  try {
    // Throws a RangeError for names that are not time zones.
    return new Intl.DateTimeFormat("en", { timeZone: raw }).resolvedOptions().timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}
