import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, ChartColumn, MessageCircle, Settings, Timer, type LucideIcon } from "lucide-react";
import { SignOutButton } from "@/components/account/SignOutButton";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import { DEFAULT_DISPLAY, type Display } from "@/lib/time/display";
import { Logo } from "./Logo";

// The frame of every signed-in page, copied from the prototype's shell: the sidebar on wider screens
// (mark and name, navigation, Settings at the bottom, then the account row) and the floating tab bar
// on phones. Navigation shows only what exists; the Goals page takes its place between Calendar and
// Focus in a later step. The coach (the AI chat, spec 19) is a page of its own, second in the list.
// Search and quick capture come with their features. Side panels go in as in the prototype: the goals
// panel to the left of the page (`panelsLeft`), others to the right (`panelsRight`); each collapses on its own.

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { href: "/", label: "Calendar", icon: CalendarDays },
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
];

const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: Settings };

type Props = {
  /** The address of the current page, to mark it in the navigation. */
  current: string;
  children: ReactNode;
  /** How times and dates are shown (the user's settings). */
  display?: Display;
  /** Side panels between the sidebar and the page (the goals panel). */
  panelsLeft?: ReactNode;
  /** Side panels to the right of the page. */
  panelsRight?: ReactNode;
};

function SidebarLink({ item, on }: { item: NavItem; on: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
        on ? "bg-raised font-medium text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink"
      }`}
    >
      <Icon className={`size-[18px] ${on ? "text-ink" : "text-ink-3"}`} strokeWidth={on ? 2.2 : 1.8} />
      {item.label}
    </Link>
  );
}

function Sidebar({ current }: { current: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line-subtle bg-canvas px-3 py-4 md:flex">
      <Link href="/" className="rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20">
        <Logo />
      </Link>
      <nav aria-label="Main navigation" className="mt-5 flex flex-col gap-0.5">
        {NAV.map((item) => (
          <SidebarLink key={item.href} item={item} on={current === item.href} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        <SidebarLink item={SETTINGS} on={current === SETTINGS.href} />
        <SignOutButton />
      </div>
    </aside>
  );
}

/** Phones: the floating round tab bar at the bottom, one icon per page. */
function TabBar({ current }: { current: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-end justify-center gap-3 px-4 pb-[max(16px,env(safe-area-inset-bottom))] md:hidden">
      <nav
        aria-label="Tab bar"
        className="pointer-events-auto flex h-14 items-center gap-1 rounded-full border border-line-subtle bg-surface/90 px-2 shadow-float backdrop-blur-xl"
      >
        {[...NAV, SETTINGS].map(({ href, label, icon: Icon }) => {
          const on = current === href;
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={on ? "page" : undefined}
              className={`flex size-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                on ? "bg-raised text-ink" : "text-ink-3"
              }`}
            >
              <Icon className="size-5" strokeWidth={on ? 2.2 : 1.8} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AppShell({ current, children, display = DEFAULT_DISPLAY, panelsLeft, panelsRight }: Props) {
  return (
    <DisplayProvider value={display}>
      <div className="flex min-h-dvh">
        <Sidebar current={current} />
        <div className="flex min-h-0 min-w-0 flex-1 pb-28 md:pb-0">
          {panelsLeft}
          <main className="min-w-0 flex-1">{children}</main>
          {panelsRight}
        </div>
        <TabBar current={current} />
      </div>
    </DisplayProvider>
  );
}
