// The pages of the app, in the order of the navigation. Shared by the sidebar (wider screens) and
// the tab bar (phones).
import { CalendarDays, ChartColumn, MessageCircle, Settings, Timer, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/", label: "Calendar", icon: CalendarDays },
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
];

export const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: Settings };
