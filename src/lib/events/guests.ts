// An event's guests (spec 24): plain e-mail addresses that Outlook invites. Shared by the editor and the
// server; the database checks the same shape (supabase/migrations/*_event_guests.sql).
//
// A guest is an address only (no name), lower-case, at most 254 characters, each once, at most 20 on an
// event. Addresses are personal data: they stay in the owner's rows, are never logged and never sent
// to Claude.

/** At most this many guests on one of the user's own events. */
export const MAX_GUESTS = 20;

/** The same pattern as app.is_guest_address in the database. */
const ADDRESS = /^[a-z0-9!#$%&'*+/=?^_{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** The address as the app keeps it (trimmed, lower-case), or null when it is not a plain address. */
export function cleanGuest(raw: string): string | null {
  const address = raw.trim().toLowerCase();
  return address.length <= 254 && ADDRESS.test(address) ? address : null;
}

export type GuestList = { ok: true; guests: string[] } | { ok: false; reason: "invalid" | "too_many" };

/** A whole list: every entry cleaned (one that is not an address fails), each once, at most 20. */
export function cleanGuestList(raw: readonly string[]): GuestList {
  const guests: string[] = [];
  for (const entry of raw) {
    const address = cleanGuest(entry);
    if (!address) return { ok: false, reason: "invalid" };
    if (!guests.includes(address)) guests.push(address);
  }
  return guests.length > MAX_GUESTS ? { ok: false, reason: "too_many" } : { ok: true, guests };
}

/** Whether two lists name the same guests in the same order. */
export function sameGuests(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((g, i) => g === y[i]);
}

/** "1 guest", "2 guests". */
export function guestCountText(count: number): string {
  return `${count} ${count === 1 ? "guest" : "guests"}`;
}

/**
 * The field's text split into the addresses typed so far (Enter or a comma adds one): the finished
 * parts, and what is left in the field.
 */
export function splitTyped(text: string): { parts: string[]; rest: string } {
  const pieces = text.split(/[,;]/);
  const rest = pieces.pop() ?? "";
  return { parts: pieces.map((p) => p.trim()).filter((p) => p !== ""), rest };
}
