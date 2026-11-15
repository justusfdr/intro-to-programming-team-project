// The pages of the app, in the order of the navigation. Shared by the sidebar (wider screens) and
// the tab bar (phones).
import { CalendarDays, ChartColumn, CreditCard, ListChecks, MessageCircle, Settings, Timer, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/", label: "Calendar", icon: CalendarDays },
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
];

/**
 * Contacts and invitations (spec 28), last in the sidebar's list, with the number of open invitations.
 * Not in the phone tab bar: a seventh icon does not fit at 375 px. On phones it is reached from Settings.
 */
export const PEOPLE: NavItem = { href: "/people", label: "People", icon: Users };

/**
 * Shared to-do lists (spec 30), in the sidebar right after Goals. Not in the phone tab bar: it holds six
 * icons already and a seventh does not fit at 375 px. On phones it is reached from the goals panel.
 */
export const LISTS: NavItem = { href: "/lists", label: "Lists", icon: ListChecks };

export const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: Settings };
/** The plans and payment (spec 24, Pro with Stripe), at the bottom above Settings. */
export const PRICING: NavItem = { href: "/pricing", label: "Pricing", icon: CreditCard };
