// The small tinted tile that stands for a goal: the target icon in the goal's colour. Every goal has
// the same icon (the data has none per goal); "No goal" gets a grey tile. Decorative: the goal's
// name always stands next to it.
import { Inbox, Target } from "lucide-react";
import { goalColor } from "@/lib/goals/colors";

const SIZES = {
  xs: { box: "size-5 rounded-md", icon: "size-3" },
  sm: { box: "size-6 rounded-md", icon: "size-3.5" },
  md: { box: "size-7 rounded-lg", icon: "size-4" },
  lg: { box: "size-8 rounded-lg", icon: "size-[18px]" },
} as const;

export function GoalTile({
  colorIndex,
  size = "md",
  className = "",
  icon = "target",
}: {
  colorIndex: number | null;
  size?: keyof typeof SIZES;
  className?: string;
  /** "inbox" draws an inbox tray instead of the target (the Inbox section, spec 11). */
  icon?: "target" | "inbox";
}) {
  const tint = colorIndex === null ? "bg-raised text-ink-3" : goalColor(colorIndex).tile;
  const { box, icon: iconClass } = SIZES[size];
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center ${box} ${tint} ${className}`}>
      {icon === "inbox" ? <Inbox className={iconClass} strokeWidth={2} /> : <Target className={iconClass} strokeWidth={2} />}
    </span>
  );
}
