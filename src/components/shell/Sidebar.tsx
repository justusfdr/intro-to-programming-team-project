"use client";

// The sidebar on wider screens (spec 25). It can be folded to a narrow strip of icons with the arrow at
// its top right. Folded, it opens again while the mouse is over it (or the keyboard focus is inside)
// and folds when the mouse leaves; opened like that it lies over the page, so nothing on the page
// jumps. The same button then keeps it open for good. The choice is remembered in this browser only.
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type FocusEvent } from "react";
import { ChevronsLeft, Pin, Target } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { keepFocusAfterCollapse } from "./collapse-focus";
import { Logo, LogoMark } from "./Logo";
import { getJson } from "@/lib/client/post-json";
import type { SidebarMe } from "@/lib/profiles/types";
import { NAV, PEOPLE, PRICING, SETTINGS, type NavItem } from "./nav";
import { openAllPanels, usePanels, usePanelsAvailable } from "./PanelState";

export const SIDEBAR_KEY = "lockedin:sidebar-folded:v1";
const CHANGED = "lockedin:sidebar-changed";
const WIDE = 232;
const NARROW = 60;

// The choice lives in localStorage; React reads it as an outside store (as the panels do).
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

/**
 * Spec 36: "Calendar" with the number of event invitations the user has not answered yet. A page that
 * has read the number passes it (the calendar page); on every other page it is asked once from the server
 * (a failure just shows no badge). Without invitations it is the plain link.
 */
function CalendarLink({ item, on, wide, pending }: { item: NavItem; on: boolean; wide: boolean; pending?: number }) {
  const [asked, setAsked] = useState<number | null>(null);
  useEffect(() => {
    if (pending !== undefined) return;
    let current = true;
    void getJson("/api/invites/count").then((answer) => {
      const count = (answer.data as { count?: unknown } | undefined)?.count;
      if (current && answer.ok && typeof count === "number") setAsked(count);
    });
    return () => {
      current = false;
    };
  }, [pending]);
  const count = pending ?? asked ?? 0;
  if (count === 0) return <SidebarLink item={item} on={on} wide={wide} />;
  const Icon = item.icon;
  const label = `${item.label}, ${count} ${count === 1 ? "invitation" : "invitations"} to answer`;
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      aria-label={label}
      title={wide ? undefined : label}
      className={`${ITEM} relative ${wide ? "w-full" : "w-9"} ${on ? "bg-raised font-medium text-ink" : QUIET}`}
    >
      <Icon className={`size-[18px] shrink-0 ${on ? "text-ink" : "text-ink-3"}`} strokeWidth={on ? 2.2 : 1.8} />
      {item.label}
      {wide ? (
        <span aria-hidden="true" className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[11px] font-semibold tabular text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : (
        <span aria-hidden="true" className="absolute right-1 top-1 size-2 rounded-full bg-today" />
      )}
    </Link>
  );
}

/**
 * "People" (spec 28) with the number of open invitations to the user. A page that has read the number
 * passes it; on every other page it is asked once from the server (a failure just shows no badge).
 */
function PeopleLink({ on, wide, invitations }: { on: boolean; wide: boolean; invitations?: number }) {
  const [asked, setAsked] = useState<number | null>(null);
  useEffect(() => {
    if (invitations !== undefined) return;
    let current = true;
    void getJson("/api/contacts/invitations/count").then((answer) => {
      const count = (answer.data as { count?: unknown } | undefined)?.count;
      if (current && answer.ok && typeof count === "number") setAsked(count);
    });
    return () => {
      current = false;
    };
  }, [invitations]);
  const count = invitations ?? asked ?? 0;
  const Icon = PEOPLE.icon;
  const label = count > 0 ? `${PEOPLE.label}, ${count} open ${count === 1 ? "invitation" : "invitations"}` : PEOPLE.label;
  return (
    <Link
      href={PEOPLE.href}
      aria-current={on ? "page" : undefined}
      aria-label={wide && count === 0 ? undefined : label}
      title={wide ? undefined : label}
      className={`${ITEM} relative ${wide ? "w-full" : "w-9"} ${on ? "bg-raised font-medium text-ink" : QUIET}`}
    >
      <Icon className={`size-[18px] shrink-0 ${on ? "text-ink" : "text-ink-3"}`} strokeWidth={on ? 2.2 : 1.8} />
      {PEOPLE.label}
      {count > 0 &&
        (wide ? (
          <span aria-hidden="true" className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[11px] font-semibold tabular text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : (
          <span aria-hidden="true" className="absolute right-1 top-1 size-2 rounded-full bg-today" />
        ))}
    </Link>
  );
}

/**
 * The user's own row at the bottom (spec 31): their photo or initials and their shown name, to the
 * profile page (where "Sign out" is). Folded, the avatar alone, with the name as its label. A page that
 * has read the profile passes it; on every other page it is asked once from the server (until then the
 * row shows an empty circle and is called "Your profile").
 */
function ProfileLink({ on, wide, me }: { on: boolean; wide: boolean; me?: SidebarMe }) {
  const [asked, setAsked] = useState<SidebarMe | null>(null);
  useEffect(() => {
    if (me) return;
    let current = true;
    void getJson("/api/profile").then((answer) => {
      const data = answer.data as { name?: unknown; photoUrl?: unknown } | undefined;
      if (!current || !answer.ok || typeof data?.name !== "string") return;
      // Only an address of our own photo route is used as a picture.
      const photoUrl = typeof data.photoUrl === "string" && data.photoUrl.startsWith("/api/profiles/") ? data.photoUrl : null;
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
      className={`${ITEM} px-[6px] ${wide ? "w-full" : "w-9"} ${on ? "bg-raised font-medium text-ink" : QUIET}`}
    >
      {shown ? (
        <Avatar name={shown.name} photoUrl={shown.photoUrl} size={24} />
      ) : (
        <span aria-hidden="true" className="size-6 shrink-0 rounded-full bg-muted" />
      )}
      {wide && shown && <span className="min-w-0 truncate">{shown.name}</span>}
    </Link>
  );
}

const ITEM = "flex h-9 items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-[9px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20";
const QUIET = "text-ink-2 hover:bg-raised/60 hover:text-ink";

/**
 * "Goals", second in the list. On the calendar it shows or hides the goals column (wide screens) or
 * opens it as a sheet (narrower ones); on every other page it goes to the calendar with the column open.
 */
function GoalsItem({ wide }: { wide: boolean }) {
  const panels = usePanels();
  const onCalendar = usePanelsAvailable();
  const width = wide ? "w-full" : "w-9";
  const label = wide ? undefined : "Goals";
  const icon = (on: boolean) => <Target className={`size-[18px] shrink-0 ${on ? "text-ink" : "text-ink-3"}`} strokeWidth={on ? 2.2 : 1.8} />;
  if (!onCalendar) {
    return (
      <Link href="/" onClick={openAllPanels} aria-label={label} title={label} className={`${ITEM} ${width} ${QUIET}`}>
        {icon(false)}
        Goals
      </Link>
    );
  }
  const open = panels.isOpen("goals");
  // The wrappers decide which button shows (a class on the button itself would fight its own display).
  return (
    <>
      <div className="hidden xl:block">
        <button
          type="button"
          aria-label={label}
          title={`${open ? "Hide" : "Show"} goals`}
          aria-pressed={open}
          onClick={() => panels.toggle("goals")}
          className={`${ITEM} ${width} ${QUIET}`}
        >
          {icon(open)}
          Goals
        </button>
      </div>
      <div className="xl:hidden">
        <button
          type="button"
          aria-label={label}
          title="Open goals"
          aria-haspopup="dialog"
          aria-expanded={panels.sheet === "goals"}
          onClick={() => panels.openSheet("goals")}
          className={`${ITEM} ${width} ${QUIET}`}
        >
          {icon(false)}
          Goals
        </button>
      </div>
    </>
  );
}

export function Sidebar({ current, invitations, me, pendingInvites }: { current: string; invitations?: number; me?: SidebarMe; pendingInvites?: number }) {
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
          {NAV.map((item, i) => (
            <Fragment key={item.href}>
              {item.href === "/" ? (
                <CalendarLink item={item} on={current === item.href} wide={wide} pending={pendingInvites} />
              ) : (
                <SidebarLink item={item} on={current === item.href} wide={wide} />
              )}
              {i === 0 && <GoalsItem wide={wide} />}
            </Fragment>
          ))}
          <PeopleLink on={current === PEOPLE.href} wide={wide} invitations={invitations} />
        </nav>
        <div className="mt-auto flex flex-col gap-0.5">
          <SidebarLink item={PRICING} on={current === PRICING.href} wide={wide} />
          <SidebarLink item={SETTINGS} on={current === SETTINGS.href} wide={wide} />
          <ProfileLink on={current === "/profile"} wide={wide} me={me} />
        </div>
      </aside>
    </div>
  );
}
