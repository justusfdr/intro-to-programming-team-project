"use client";

// The keyboard shortcut help (spec 26): "?" on any signed-in page opens a list of the shortcuts that
// exist (src/lib/shortcuts/list.ts). A native <dialog> like the goal editor: focus stays inside,
// Escape, the close button, a click on the backdrop or "?" again close it, and the focus goes back to
// where it was. It does not open while typing in a field, with Ctrl, Cmd or Alt held, or while
// another dialog is open.
import { X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { isHelpKey, keyLabel, SHORTCUTS } from "@/lib/shortcuts/list";

export function ShortcutHelp() {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || !isHelpKey(e)) return;
      const own = dialog.current;
      if (own?.open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      // Another dialog or card is open: its keys come first.
      const other = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]')].some((el) => el !== own);
      if (other) return;
      e.preventDefault();
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const onClose = () => {
    setOpen(false);
    const back = returnTo.current;
    returnTo.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="shortcut-help-title"
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && setOpen(false)}
      className="event-editor m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-card bg-surface p-0 text-ink shadow-pop md:m-auto md:max-h-[calc(100dvh-3rem)] md:max-w-md md:rounded-card"
    >
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 id="shortcut-help-title" className="text-base font-semibold tracking-snug text-ink">
            Keyboard shortcuts
          </h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)} autoFocus>
            <X className="size-4" strokeWidth={1.8} aria-hidden />
          </Button>
        </div>
        <div className="scroll-thin flex min-h-0 flex-col gap-5 overflow-y-auto px-5 pt-4 pb-6">
          {SHORTCUTS.map((group) => (
            <section key={group.where} aria-label={group.where} className="flex flex-col gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{group.where}</p>
              <dl className="flex flex-col gap-1.5">
                {group.shortcuts.map((s) => (
                  <div key={`${s.keys.join("+")}-${s.does}`} className="flex items-start justify-between gap-4">
                    <dt className="flex shrink-0 gap-1">
                      {s.keys.map((k, i) => (
                        <Fragment key={k}>
                          {i > 0 && <span className="sr-only"> or </span>}
                          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line bg-raised px-1.5 font-sans text-xs font-medium text-ink">
                            {keyLabel(k)}
                          </kbd>
                        </Fragment>
                      ))}
                    </dt>
                    <dd className="text-right text-sm text-ink-2">{s.does}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="text-xs text-ink-3">Shortcuts do nothing while you type in a field.</p>
        </div>
      </div>
    </dialog>
  );
}
