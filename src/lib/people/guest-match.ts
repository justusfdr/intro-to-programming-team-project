// Guests shown as people in the event preview (spec 35): a guest's address is matched against the
// signed-in user's own contacts only, on the server, and only for addresses that are on the events the
// page sends. Strangers are never looked up: an address that is not one of the user's contacts stays a
// plain address. The demo contacts (spec 32) have no address, so they never match (R58: never guests).
// Pure, tested in guest-match.test.ts.
import type { GuestPerson } from "@/lib/events/preview";

/** What the matching needs of a contact: their account, shown name, photo address and e-mail address. */
export type MatchableContact = { userId: string; name: string; photoUrl: string | null; email: string };

/** Every guest and organizer address on these events, in lower case, each once. */
export function guestAddresses(events: Iterable<{ guests?: readonly string[]; organizer?: string }>): Set<string> {
  const addresses = new Set<string>();
  for (const event of events) {
    for (const guest of event.guests ?? []) addresses.add(guest.trim().toLowerCase());
    if (event.organizer) addresses.add(event.organizer.trim().toLowerCase());
  }
  addresses.delete("");
  return addresses;
}

/**
 * The user's contacts among these addresses: address (lower case) → id, shown name and photo address.
 * Nothing for an address that is not one of the contacts, and nothing more than the three fields.
 */
export function matchGuests(addresses: ReadonlySet<string>, contacts: readonly MatchableContact[]): Record<string, GuestPerson> {
  const found: Record<string, GuestPerson> = {};
  for (const contact of contacts) {
    const address = contact.email.trim().toLowerCase();
    if (addresses.has(address) && !Object.hasOwn(found, address)) {
      found[address] = { userId: contact.userId, name: contact.name, photoUrl: contact.photoUrl };
    }
  }
  return found;
}
