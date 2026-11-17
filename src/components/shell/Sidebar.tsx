"use client";

// The sidebar on wider screens (spec 25). It can be folded to a narrow strip of icons with the arrow at
// its top right. Folded, it opens again while the mouse is over it (or the keyboard focus is inside)
// and folds when the mouse leaves; opened like that it lies over the page, so nothing on the page
// jumps. The same button then keeps it open for good. The choice is remembered in this browser only.
// At the bottom: Pricing, Settings, then the user's own row to their profile (spec 40), where "Sign out" is.
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type FocusEvent } from "react";
import { ChevronsLeft, Pin } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { getJson } from "@/lib/client/post-json";
import type { SidebarMe } from "@/lib/profiles/types";
import { keepFocusAfterCollapse } from "./collapse-focus";
import { Logo, LogoMark } from "./Logo";
import { NAV, PRICING, SETTINGS, type NavItem } from "./nav";
import { WidgetArea } from "@/components/widgets/WidgetArea";

export const SIDEBAR_KEY = "lockedin:sidebar-folded:v1";
const CHANGED = "lockedin:sidebar-changed";
const WIDE = 232;
const NARROW = 60;

// The choice lives in localStorage; React reads it as an outside store.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function readFolded(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false; // no storage (private window): the sidebar stays open
  }
}

function SidebarLink({ item, on, wide }: { item: NavItem; on: boolean; wide: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      aria-label={wide ? undefined : item.label}
      title={wide ? undefined : item.label}
      className={`flex h-9 items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-[9px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
        wide ? "w-full" : "w-9"
      } ${on ? "bg-raised font-medium text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink"}`}
    >
      <Icon className={`size-[18px] shrink-0 ${on ? "text-ink" : "text-ink-3"}`} strokeWidth={on ? 2.2 : 1.8} />
      {item.label}
    </Link>
  );
}

/** Only an address of our own photo route is ever used as a picture. */
const OWN_PHOTO = /^\/api\/profiles\/[0-9a-f-]{36}\/photo\?v=\d+$/i;

/**
 * The user's own row at the bottom (spec 40): their photo or initials and their shown name, to the
 * profile page (where "Sign out" is). Folded, the avatar alone, with the name as its label. A page that
 * has read the profile passes it; on every other page it is asked once from the server (until then the
 * row shows an empty circle and is called "Your profile"; a failure keeps it so).
 */
function ProfileLink({ on, wide, me }: { on: boolean; wide: boolean; me?: SidebarMe }) {
  const [asked, setAsked] = useState<SidebarMe | null>(null);
  useEffect(() => {
    if (me) return;
    let current = true;
    void getJson("/api/profile").then((answer) => {
      const data = answer.data as { name?: unknown; photoUrl?: unknown } | undefined;
      if (!current || !answer.ok || typeof data?.name !== "string") return;
      const photoUrl = typeof data.photoUrl === "string" && OWN_PHOTO.test(data.photoUrl) ? data.photoUrl : null;
      setAsked({ name: data.name, photoUrl });
    });
    return () => {
      current = false;
    };
  }, [me]);
  const shown = me ?? asked;
  const label = shown ? shown.name : "Your profile";
  return (
    <Link
      href="/profile"
      aria-current={on ? "page" : undefined}
      aria-label={wide && shown ? undefined : label}
      title={wide ? undefined : label}
      className={`flex h-9 items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-[6px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
        wide ? "w-full" : "w-9"
      } ${on ? "bg-raised font-medium text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink"}`}
    >
      {shown ? <Avatar name={shown.name} photoUrl={shown.photoUrl} size={24} /> : <span aria-hidden="true" className="size-6 shrink-0 rounded-full bg-muted" />}
      {wide && shown && <span className="min-w-0 truncate">{shown.name}</span>}
    </Link>
  );
}

export function Sidebar({ current, me }: { current: string; me?: SidebarMe }) {
  // On the server (and in the first render) the sidebar is open.
  const folded = useSyncExternalStore(subscribe, readFolded, () => false);
  const [peek, setPeek] = useState(false);
  const wide = !folded || peek;
  const logoLink = useRef<HTMLAnchorElement>(null);

  function setFolded(next: boolean) {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    } catch {
      // Without storage the sidebar stays as it is.
    }
    window.dispatchEvent(new Event(CHANGED));
    // Folding takes effect at once, also while the mouse is still over the sidebar.
    if (next) setPeek(false);
  }

  function onBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPeek(false);
  }

  return (
    // The place the sidebar takes in the page: narrow while folded, also when it is opened over the page.
    <div className="sticky top-0 z-30 hidden h-dvh shrink-0 transition-[width] duration-150 md:block" style={{ width: folded ? NARROW : WIDE }}>
      <aside
        data-folded={folded || undefined}
        onMouseEnter={() => folded && setPeek(true)}
        onMouseLeave={() => setPeek(false)}
        onFocus={() => folded && setPeek(true)}
        onBlur={onBlur}
        className={`absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-line-subtle bg-canvas px-3 py-4 transition-[width] duration-150 ${
          folded && peek ? "shadow-float" : ""
        }`}
        style={{ width: wide ? WIDE : NARROW }}
      >
        <div className="flex h-9 items-center justify-between gap-2">
          <Link
            ref={logoLink}
            href="/"
            aria-label={wide ? undefined : "Calendar"}
            className="overflow-hidden whitespace-nowrap rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            {wide ? <Logo /> : <LogoMark />}
          </Link>
          {wide && (
            <button
              type="button"
              onClick={(event) => {
                setFolded(!folded);
                // Folding removes this button: by keyboard the focus moves to the logo link, which stays.
                if (!folded) keepFocusAfterCollapse(event.detail, logoLink.current);
              }}
              aria-label={folded ? "Keep sidebar open" : "Collapse sidebar"}
              title={folded ? "Keep sidebar open" : "Collapse sidebar"}
              className="grid size-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
            >
              {folded ? <Pin className="size-4" strokeWidth={1.8} /> : <ChevronsLeft className="size-4" strokeWidth={1.8} />}
            </button>
          )}
        </div>
        <nav aria-label="Main navigation" className="mt-4 flex flex-col gap-0.5">
          {NAV.map((item) => (
            <SidebarLink key={item.href} item={item} on={current === item.href} wide={wide} />
          ))}
        </nav>
        {/* The widgets (spec 45), only while the sidebar is kept open; folded, the bottom links stay at the bottom. */}
        {!folded && <WidgetArea />}
        <div className="mt-auto flex flex-col gap-0.5">
          <SidebarLink item={PRICING} on={current === PRICING.href} wide={wide} />
          <SidebarLink item={SETTINGS} on={current === SETTINGS.href} wide={wide} />
          <ProfileLink on={current === "/profile"} wide={wide} me={me} />
        </div>
      </aside>
    </div>
  );
}
