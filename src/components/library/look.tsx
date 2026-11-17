// How each shelf of the library looks (spec 29): a pale tint from the goal colours, an icon, and a
// small drawing for the corner of a tile. Quiet on purpose: the number and the title do the talking.
import { BookOpen, Lightbulb, Smartphone, Zap, type LucideIcon } from "lucide-react";
import type { Topic } from "@/lib/library/types";

export type TopicLook = {
  /** The pale background of a tile's top and of an article's header. */
  tint: string;
  /** The icon and the drawing on that background. */
  mark: string;
  icon: LucideIcon;
};

export const TOPIC_LOOK: Record<Topic, TopicLook> = {
  interruptions: { tint: "bg-indigo-50", mark: "text-indigo-300", icon: Zap },
  phones: { tint: "bg-rose-50", mark: "text-rose-300", icon: Smartphone },
  helps: { tint: "bg-emerald-50", mark: "text-emerald-300", icon: Lightbulb },
  guides: { tint: "bg-amber-50", mark: "text-amber-300", icon: BookOpen },
};

/**
 * The drawing in the corner of a tile, one per shelf: a line with a piece knocked out of it
 * (interruptions), a stack of feed cards (phones), a ring closing (what helps), steps (guides).
 * Decoration only.
 */
export function TopicMotif({ topic, className = "" }: { topic: Topic; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 6, strokeLinecap: "round" as const };
  return (
    <svg viewBox="0 0 120 80" aria-hidden="true" className={`${TOPIC_LOOK[topic].mark} ${className}`}>
      {topic === "interruptions" && (
        <>
          <path {...common} d="M6 52 H42" />
          <path {...common} className="library-nudge" d="M58 30 H76" />
          <path {...common} d="M92 52 H114" />
        </>
      )}
      {topic === "phones" && (
        <>
          <rect {...common} x="34" y="5" width="52" height="17" rx="6" />
          <rect {...common} x="34" y="31" width="52" height="17" rx="6" opacity="0.6" />
          <rect {...common} x="34" y="57" width="52" height="17" rx="6" opacity="0.3" />
        </>
      )}
      {topic === "helps" && (
        <>
          <circle {...common} cx="60" cy="40" r="30" opacity="0.35" />
          {/* Three quarters of the ring, drawn from the top. */}
          <path {...common} className="library-draw" pathLength={100} d="M60 10 A30 30 0 1 1 30 40" />
        </>
      )}
      {topic === "guides" && (
        <>
          <path {...common} d="M14 62 H42 V40 H70 V18 H104" />
        </>
      )}
    </svg>
  );
}
