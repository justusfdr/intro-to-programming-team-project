"use client";

// A floating panel on the calendar, copied from the first prototype: on wider screens next to its
// anchor (kept inside the window), on phones (< 640 px) a sheet from the bottom over a dimmed page.
// Closes on a click outside and on Esc, then gives the focus back. Without the prototype's animation
// package: it appears at once.
// Spec 33: `passive` makes it a hover card: it never takes the focus, never keeps Tab inside, never
// becomes a sheet, and reports the pointer entering and leaving it.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";

/** Where a panel opens: the box of the element that opened it, in window pixels. */
export type Anchor = { left: number; right: number; top: number; bottom: number };

export function anchorOf(el: Element): Anchor {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
}

/** An anchor at a point (for example where the pointer was released). */
export function pointAnchor(x: number, y: number): Anchor {
  return { left: x, right: x, top: y, bottom: y };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Below this window width the panel becomes a sheet from the bottom. */
export const SHEET_BREAKPOINT = 640;
const GAP = 10;
const MARGIN = 8;

type Viewport = { w: number; h: number };

function readViewport(): Viewport {
  return typeof window === "undefined" ? { w: 1280, h: 800 } : { w: window.innerWidth, h: window.innerHeight };
}

type Props = {
  anchor: Anchor;
  /** The dialog's name for screen readers. */
  label: string;
  /** Width on wider screens (px). */
  width?: number;
  onClose: () => void;
  children: ReactNode;
  /** Spec 33: a hover card that leaves the focus where it is and never traps it. */
  passive?: boolean;
  onPointerEnter?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerLeave?: (e: ReactPointerEvent<HTMLDivElement>) => void;
};

export function FloatingPanel({ anchor, label, width = 340, onClose, children, passive = false, onPointerEnter, onPointerLeave }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>(readViewport);
  // The measured height, so long panels stay inside the window too.
  const [height, setHeight] = useState(360);
  const sheet = !passive && viewport.w < SHEET_BREAKPOINT;

  // Measure, and place again when the window changes (not close: on phones the keyboard resizes it).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    const onResize = () => setViewport(readViewport());
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [sheet]); // the element changes between sheet and floating mode

  // A click outside and Esc close it.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (ref.current && target && !ref.current.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      // An element inside has used Esc already.
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // The focus moves into the panel and back when it closes.
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (el && !passive && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      const active = document.activeElement;
      const lost = active === null || active === document.body || (el !== null && el.contains(active));
      if (lost && previous?.isConnected) previous.focus({ preventScroll: true });
    };
    // Only when it opens; `passive` does not change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab stays in the panel: past the end it goes to the start and back.
  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (passive || e.key !== "Tab" || !ref.current) return;
    const focusables = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (typeof document === "undefined") return null;

  if (sheet) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        <div aria-hidden className="absolute inset-0 bg-ink/20" />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onPanelKeyDown}
          className="scroll-thin relative max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-panel border-t border-line-subtle bg-surface pb-[max(12px,env(safe-area-inset-bottom))] shadow-pop focus:outline-none"
        >
          <div className="relative flex h-10 items-center justify-center">
            <div aria-hidden className="h-1 w-9 rounded-full bg-muted" />
            <button type="button" aria-label="Close" onClick={onClose} className={buttonClass("ghost", "icon", "absolute right-2 top-1 text-ink-3")}>
              <X className="size-4" strokeWidth={1.8} />
            </button>
          </div>
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  const w = Math.min(width, viewport.w - 2 * MARGIN);
  let left = anchor.right + GAP;
  if (left + w > viewport.w - MARGIN) left = anchor.left - w - GAP;
  left = Math.max(MARGIN, Math.min(left, viewport.w - w - MARGIN));
  const top = Math.max(MARGIN, Math.min(anchor.top, viewport.h - height - MARGIN));

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      tabIndex={passive ? undefined : -1}
      onKeyDown={onPanelKeyDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="scroll-thin fixed z-50 overflow-y-auto overscroll-contain rounded-card border border-line-subtle bg-surface shadow-float focus:outline-none"
      style={{ left, top, width: w, maxHeight: `calc(100dvh - ${2 * MARGIN}px)` }}
    >
      {children}
    </div>,
    document.body,
  );
}
