import Link from "next/link";
import type { ReactNode } from "react";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import type { SidebarMe } from "@/lib/profiles/types";
import { DEFAULT_DISPLAY, type Display } from "@/lib/time/display";
import { NAV, PRICING, SETTINGS } from "./nav";
import { ShortcutHelp } from "./ShortcutHelp";
import { Sidebar } from "./Sidebar";

// The frame of every signed-in page, copied from the prototype's shell: the sidebar on wider screens
// (mark and name, navigation, Pricing and Settings at the bottom, then the user's own row to their profile,
// spec 40) and the floating tab bar on phones (the profile is reached from Settings there). Navigation shows only what exists: Calendar, Goals (a page of its own since spec 39; before,
// a column beside the calendar), Coach (spec 19), Focus, Analytics. Search and quick capture come with
// their features. The sidebar itself folds to a strip of icons (./Sidebar.tsx, spec 25). "?" opens the
// list of keyboard shortcuts on every signed-in page (./ShortcutHelp.tsx, spec 26).

type Props = {
  /** The address of the current page, to mark it in the navigation. */
  current: string;
  children: ReactNode;
  /** How times and dates are shown (the user's settings). */
  display?: Display;
  /** Open invitations to the user, for the badge on "People" (spec 53); the sidebar asks the server when left out. */
  invitations?: number;
  /** The user's shown name and photo for the sidebar's last row (spec 40); the sidebar asks the server when left out. */
  me?: SidebarMe;
  /** Spec 54: event invitations not answered yet, for the badge on "Calendar"; the sidebar asks the server when left out. */
  pendingInvites?: number;
};

/**
 * Phones: the floating round tab bar at the bottom, one icon per page. Seven icons of 44 px with 2 px
 * between them make a bar of 334 px, which fits a 375 px phone with 16 px on each side.
 */
function TabBar({ current }: { current: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-end justify-center gap-3 px-4 pb-[max(16px,env(safe-area-inset-bottom))] md:hidden">
      <nav
        aria-label="Tab bar"
        className="pointer-events-auto flex h-14 items-center gap-0.5 rounded-full border border-line-subtle bg-surface/90 px-1.5 shadow-float backdrop-blur-xl"
      >
        {[...NAV, PRICING, SETTINGS].map(({ href, label, icon: Icon }) => {
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

export function AppShell({ current, children, display = DEFAULT_DISPLAY, invitations, me, pendingInvites }: Props) {
  return (
    <DisplayProvider value={display}>
      <div className="flex min-h-dvh">
        <Sidebar current={current} invitations={invitations} me={me} pendingInvites={pendingInvites} />
        <div className="flex min-h-0 min-w-0 flex-1 pb-28 md:pb-0">
          <main className="min-w-0 flex-1">{children}</main>
        </div>
        <TabBar current={current} />
        <ShortcutHelp />
      </div>
    </DisplayProvider>
  );
}
