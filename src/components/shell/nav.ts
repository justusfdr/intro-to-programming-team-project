// The pages of the app, in the order of the navigation. Shared by the sidebar (wider screens) and
// the tab bar (phones). Goals is a page of its own since spec 39 (before, a column beside the calendar).
import { CalendarDays, ChartColumn, CreditCard, MessageCircle, Settings, Target, Timer, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/", label: "Calendar", icon: CalendarDays },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
];

/**
 * Contacts and invitations (spec 53), last in the sidebar's list, with the number of open invitations.
 * Not in the phone tab bar (it is full); on phones it is reached from Settings.
 */
export const PEOPLE: NavItem = { href: "/people", label: "People", icon: Users };

export const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: Settings };
/** The plans and payment (spec 24, Pro with Stripe), at the bottom above Settings. */
export const PRICING: NavItem = { href: "/pricing", label: "Pricing", icon: CreditCard };
