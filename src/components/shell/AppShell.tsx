import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/account/SignOutButton";
import { CalendarIcon, TimerIcon } from "@/components/ui/icons";
import { Logo } from "./Logo";

// The frame of every signed-in page, in the prototype's layout: a sidebar on wider screens
// (mark and name, navigation, account at the bottom) and a slim top bar on phones.
// Navigation shows only what exists. Later steps add their pages to NAV. Side panels go in as in
// the prototype: the goals panel to the left of the page (`panelsLeft`), the AI chat panel later to
// the right (`panelsRight`); each collapses on its own.

const NAV = [
  { href: "/", label: "Calendar", icon: CalendarIcon },
  { href: "/focus", label: "Focus", icon: TimerIcon },
] as const;

type Props = {
  /** The address of the current page, to mark it in the navigation. */
  current: string;
  children: ReactNode;
  /** Side panels between the sidebar and the page (the goals panel). */
  panelsLeft?: ReactNode;
  /** Side panels to the right of the page (the AI chat panel, in a later step). */
  panelsRight?: ReactNode;
};

export function AppShell({ current, children, panelsLeft, panelsRight }: Props) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line-subtle bg-canvas px-3 py-4 md:flex">
        <Link href="/" className="rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20">
          <Logo />
        </Link>
        <nav aria-label="Main navigation" className="mt-6 flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = current === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                  on ? "bg-raised font-medium text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink"
                }`}
              >
                <Icon className={`size-[18px] ${on ? "text-ink" : "text-ink-3"}`} strokeWidth={on ? 2.2 : 1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-line-subtle pt-3">
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line-subtle bg-canvas px-4 py-2.5 md:hidden">
          <Link href="/" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20">
            <Logo />
          </Link>
          <SignOutButton compact />
        </header>
        <div className="flex min-h-0 min-w-0 flex-1">
          {panelsLeft}
          <main className="min-w-0 flex-1">{children}</main>
          {panelsRight}
        </div>
      </div>
    </div>
  );
}
