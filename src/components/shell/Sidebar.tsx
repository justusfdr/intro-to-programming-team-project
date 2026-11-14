"use client";

// The sidebar on wider screens (spec 25). It can be folded to a narrow strip of icons with the arrow at
// its top right. Folded, it opens again while the mouse is over it (or the keyboard focus is inside)
// and folds when the mouse leaves; opened like that it lies over the page, so nothing on the page
// jumps. The same button then keeps it open for good. The choice is remembered in this browser only.
import Link from "next/link";
import { Fragment, useState, useSyncExternalStore, type FocusEvent } from "react";
import { ChevronsLeft, Pin, Target } from "lucide-react";
import { SignOutButton } from "@/components/account/SignOutButton";
import { Logo, LogoMark } from "./Logo";
import { NAV, PRICING, SETTINGS, type NavItem } from "./nav";
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

export function Sidebar({ current }: { current: string }) {
  // On the server (and in the first render) the sidebar is open.
  const folded = useSyncExternalStore(subscribe, readFolded, () => false);
  const [peek, setPeek] = useState(false);
  const wide = !folded || peek;

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
            href="/"
            aria-label={wide ? undefined : "Calendar"}
            className="overflow-hidden whitespace-nowrap rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            {wide ? <Logo /> : <LogoMark />}
          </Link>
          {wide && (
            <button
              type="button"
              onClick={() => setFolded(!folded)}
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
              <SidebarLink item={item} on={current === item.href} wide={wide} />
              {i === 0 && <GoalsItem wide={wide} />}
            </Fragment>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <SidebarLink item={PRICING} on={current === PRICING.href} wide={wide} />
            <SidebarLink item={SETTINGS} on={current === SETTINGS.href} wide={wide} />
          </div>
          <div className={wide ? "w-full" : "w-9"}>
            <SignOutButton compact={!wide} />
          </div>
        </div>
      </aside>
    </div>
  );
}
