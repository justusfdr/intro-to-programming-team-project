"use client";

// The window the widgets open in the middle of the screen (spec 45): the weather in detail, the gallery
// and a widget's settings. A native <dialog> like the places and the goal editor: Escape, the close
// button or a click on the backdrop close it; the page behind cannot be used meanwhile.
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function WidgetDialog({
  open,
  onClose,
  title,
  titleId,
  width = "md:max-w-lg",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  /** The heading; also the dialog's name for screen readers. */
  title: ReactNode;
  titleId: string;
  /** The widest it gets on wider screens. */
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && onClose()}
      className={`event-editor m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-card bg-surface p-0 text-ink shadow-pop md:m-auto md:max-h-[calc(100dvh-3rem)] md:rounded-card ${width}`}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-4 pb-2">
            <h2 id={titleId} className="min-w-0 truncate text-base font-semibold tracking-snug">
              {title}
            </h2>
            <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
              <X className="size-4" aria-hidden />
            </Button>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line-subtle px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
