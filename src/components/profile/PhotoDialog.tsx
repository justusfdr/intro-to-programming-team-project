"use client";

// "Position your photo" (spec 31, "Positioning the photo", added 15 Nov 2026): after a picture is chosen,
// this native <dialog> shows it in a square frame with a round mask, so the person sees what the round
// photo will show. The picture is dragged with the mouse or a finger (pointer capture), moved with the
// arrow keys (Shift for larger steps), and zoomed with the slider, its minus and plus buttons, or "+" and
// "-" in the frame, from "fits the frame" to 4 times, around the frame's centre. It can never be moved so
// far that the frame shows empty space (the geometry: src/lib/profiles/crop.ts). A 64 px round preview
// beside the frame follows every change. "Cancel" (or Escape) changes nothing; "Use photo" hands the
// placed square to the page, which cuts, encodes and uploads it; a refusal shows here and the dialog stays.
import { Minus, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import {
  arrowStep,
  centredPlace,
  MAX_ZOOM,
  MIN_ZOOM,
  moveBy,
  placeCrop,
  shownSize,
  ZOOM_STEP,
  zoomTo,
  type CropPlace,
  type SourceRect,
} from "@/lib/profiles/crop";

/** The chosen picture as the dialog shows it: an address for the <img> and its upright size. */
export type ShownPicture = { url: string; width: number; height: number };

/** The frame's side: about 280 px, smaller on narrow phones. */
export const FRAME = 280;
const FRAME_NARROW = 220;
const PREVIEW = 64;

function frameForWindow(): number {
  return typeof window !== "undefined" && window.innerWidth < 420 ? FRAME_NARROW : FRAME;
}

type Props = {
  /** The picture to place; null: the dialog is closed. */
  picture: ShownPicture | null;
  /** The photo is being cut and sent: the buttons wait. */
  busy: boolean;
  /** Why the last "Use photo" did not work (shown in the dialog, which stays open). */
  error: string | null;
  onCancel: () => void;
  onUse: (source: SourceRect) => void;
};

export function PhotoDialog({ picture, busy, error, onCancel, onUse }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  // A click on the dimmed page around the dialog cancels, but only when it also started there (a drag of
  // the photo that ends outside the frame is not a click outside).
  const downOutside = useRef(false);
  const open = picture !== null;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // Straight to the frame, so the arrow keys move the photo at once.
      element.querySelector<HTMLElement>("[data-photo-frame]")?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="photo-dialog-title"
      // Escape: the same as Cancel (the page closes the dialog), but not while the photo is being sent.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onPointerDown={(event) => {
        downOutside.current = event.target === dialog.current;
      }}
      onClick={(event) => {
        if (event.target === dialog.current && downOutside.current && !busy) onCancel();
        downOutside.current = false;
      }}
      className="event-editor m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-card bg-surface p-0 text-ink shadow-pop sm:m-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-lg sm:rounded-card"
    >
      {picture && <PhotoPlacer key={picture.url} picture={picture} busy={busy} error={error} onCancel={onCancel} onUse={onUse} />}
    </dialog>
  );
}

/** The dialog's inside: frame, preview, zoom, hints, the error and the two buttons. */
export function PhotoPlacer({ picture, busy, error, onCancel, onUse }: Omit<Props, "picture"> & { picture: ShownPicture }) {
  const { width, height, url } = picture;
  const uid = useId();
  const [frame] = useState(frameForWindow);
  const [place, setPlace] = useState<CropPlace>(() => centredPlace(width, height, frame));
  const drag = useRef<{ pointer: number; startX: number; startY: number; from: CropPlace } | null>(null);

  const shown = shownSize(width, height, frame, place.zoom);
  const zoomBy = (delta: number) => setPlace((p) => zoomTo(width, height, frame, p, p.zoom + delta));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || busy) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    drag.current = { pointer: e.pointerId, startX: e.clientX, startY: e.clientY, from: place };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    setPlace(moveBy(width, height, frame, d.from, e.clientX - d.startX, e.clientY - d.startY));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (busy || e.altKey || e.ctrlKey || e.metaKey) return;
    const step = arrowStep(e.key, e.shiftKey);
    if (step) {
      e.preventDefault();
      setPlace((p) => moveBy(width, height, frame, p, step.dx, step.dy));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomBy(ZOOM_STEP);
    } else if (e.key === "-") {
      e.preventDefault();
      zoomBy(-ZOOM_STEP);
    }
  };

  const ratio = PREVIEW / frame;
  const imageStyle = (k: number) => ({ left: place.x * k, top: place.y * k, width: shown.width * k, height: shown.height * k });

  return (
    <div className="flex max-h-[inherit] flex-col">
      <div className="px-5 pt-5">
        <h2 id="photo-dialog-title" className="text-base font-semibold tracking-snug text-ink">
          Position your photo
        </h2>
        <p id={`${uid}-hint`} className="mt-1 text-xs text-ink-3">
          Drag the photo or use the arrow keys to move it; zoom with the slider. The circle shows your round photo.
        </p>
      </div>

      <div className="scroll-thin flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pt-4 pb-5">
        <div className="flex flex-wrap items-start justify-center gap-5 sm:justify-start">
          <div
            data-photo-frame
            role="group"
            tabIndex={0}
            aria-label="Photo position"
            aria-describedby={`${uid}-hint`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
            style={{ width: frame, height: frame }}
            className="relative shrink-0 cursor-grab touch-none overflow-hidden rounded-lg bg-raised select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 active:cursor-grabbing"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local picture that is not uploaded yet */}
            <img src={url} alt="" draggable={false} style={imageStyle(1)} className="pointer-events-none absolute max-w-none" />
            {/* The round mask: everything outside the circle is dimmed. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgb(16_16_16_/_0.5)] ring-2 ring-white/80" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div data-photo-preview style={{ width: PREVIEW, height: PREVIEW }} className="relative overflow-hidden rounded-full bg-raised ring-1 ring-line-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element -- the same local picture, smaller */}
              <img src={url} alt="" draggable={false} style={imageStyle(ratio)} className="pointer-events-none absolute max-w-none" />
            </div>
            <span className="text-xs text-ink-3">Preview</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Zoom out" disabled={busy || place.zoom <= MIN_ZOOM} onClick={() => zoomBy(-ZOOM_STEP)}>
            <Minus className="size-4" strokeWidth={2} aria-hidden />
          </Button>
          <input
            type="range"
            aria-label="Zoom"
            aria-valuetext={`${place.zoom.toFixed(1)} times`}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={place.zoom}
            disabled={busy}
            onChange={(e) => {
              const next = Number(e.target.value);
              setPlace((p) => zoomTo(width, height, frame, p, next));
            }}
            className="min-w-0 flex-1 accent-ink"
          />
          <Button variant="ghost" size="icon" aria-label="Zoom in" disabled={busy || place.zoom >= MAX_ZOOM} onClick={() => zoomBy(ZOOM_STEP)}>
            <Plus className="size-4" strokeWidth={2} aria-hidden />
          </Button>
        </div>

        <p className="text-xs text-ink-3">Choose the photo again to move it later: a saved photo is already cut.</p>

        <div aria-live="polite">{error && <FormMessage tone="error" text={error} />}</div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle pt-4">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => onUse(placeCrop(width, height, frame, place).source)}>
            {busy ? "Saving…" : "Use photo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
