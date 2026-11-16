"use client";

// The goal taking shape (spec 42), the heart of the setup dialog: the goal's tile and name, then small
// tags that pop in one after the other as the answers come ("3× a week", "60 min", "Evenings", …).
// Before a category is chosen, a grey placeholder tile and "Your new goal". A tag is a button that goes
// back to its question. Also the progress bar of six segments and the faint tint of the frame.
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { goalColor } from "@/lib/goals/colors";
import type { RoutineTag, SetupStep } from "@/lib/goals/setup";
import type { GoalColorName, GoalLook } from "@/lib/goals/style";
import { GoalTile } from "../GoalTile";
import { focusRing } from "./parts";

/**
 * The tile: it turns and pops whenever its icon or colour changes (a new key starts the animation
 * again). `look` null: the grey placeholder.
 */
export function SetupTile({ look, size = "lg" }: { look: GoalLook | null; size?: "lg" | "xl" }) {
  if (look === null) {
    return (
      <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-line bg-raised text-ink-3">
        <Sparkles className="size-4" strokeWidth={1.8} />
      </span>
    );
  }
  return (
    <span key={`${look.color}-${look.icon}`} className="setup-tile-pop inline-flex shrink-0">
      <GoalTile look={look} size={size} />
    </span>
  );
}

export function GoalTakingShape({
  look,
  title,
  tags,
  onTag,
}: {
  look: GoalLook | null;
  title: string;
  tags: RoutineTag[];
  /** Goes back to the question of a tag. */
  onTag: (step: SetupStep) => void;
}) {
  const name = title.trim();
  return (
    <div className="flex min-w-0 items-start gap-3">
      <SetupTile look={look} />
      <div className="min-w-0 flex-1">
        <p className={`truncate pt-1 text-[15px] leading-6 font-semibold tracking-snug ${name ? "text-ink" : "text-ink-3"}`}>{name || "Your new goal"}</p>
        {tags.length > 0 && (
          <ul aria-label="Your goal so far" className="mt-1.5 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Tag key={tag.key} tag={tag} onTag={onTag} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** How long a new tag pops in; after that, a changed value flips instead. */
const TAG_IN_MS = 340;

/** One tag: it pops in when it first appears; later a new value flips in instead of jumping. */
function Tag({ tag, onTag }: { tag: RoutineTag; onTag: (step: SetupStep) => void }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), TAG_IN_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <li className="setup-tag-in flex">
      <button
        type="button"
        onClick={() => onTag(tag.step)}
        aria-label={`${tag.label}. Change`}
        title="Change"
        // The chip is 24 px high; the invisible area around it makes the target 44 px.
        className={`relative inline-flex h-6 max-w-56 items-center rounded-full bg-raised px-2.5 text-xs font-medium text-ink-2 transition-colors before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-[''] hover:bg-muted hover:text-ink ${focusRing}`}
      >
        <span key={tag.text} className={`inline-block truncate ${settled ? "setup-tag-flip" : ""}`}>
          {tag.text}
        </span>
      </button>
    </li>
  );
}

export const SEGMENTS = 6;

/**
 * Six segments that fill in the goal's colour (ink before a category is chosen). Segments that fill on
 * one change follow each other: each one starts a little after the one before it.
 */
export function ProgressBar({ filled, from, color }: { filled: number; from: number; color: GoalColorName | null }) {
  const fill = color === null ? "bg-ink" : goalColor(color).dot;
  return (
    <div aria-hidden className="flex gap-1">
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const on = i < filled;
        const delay = filled > from && i >= from ? (i - from) * 90 : 0;
        return (
          <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className={`setup-segment block h-full origin-left rounded-full ${fill}`}
              style={{ transform: `scaleX(${on ? 1 : 0})`, transitionDelay: `${delay}ms` }}
            />
          </span>
        );
      })}
    </div>
  );
}

/** The faint tint at the top of the frame, in the goal's colour. Every class written out, so Tailwind finds it. */
const TINTS: Record<GoalColorName, string> = {
  rose: "from-rose-50",
  teal: "from-teal-50",
  indigo: "from-indigo-50",
  amber: "from-amber-50",
  emerald: "from-emerald-50",
  pink: "from-pink-50",
  sky: "from-sky-50",
  violet: "from-violet-50",
  orange: "from-orange-50",
  slate: "from-slate-50",
};

export function FrameTint({ color }: { color: GoalColorName | null }) {
  return (
    <div
      aria-hidden
      className={`setup-tint pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b to-transparent ${color ? TINTS[color] : ""}`}
      style={{ opacity: color ? 1 : 0 }}
    />
  );
}
