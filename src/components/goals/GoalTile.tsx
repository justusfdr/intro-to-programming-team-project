// The small tinted tile that stands for a goal: the goal's own icon in its colour, as the prototype's
// GoalIcon. Without a goal ("No goal") a grey tile with a briefcase, as in the prototype; the Inbox
// section draws an inbox tray. Decorative: the goal's name always stands next to it.
import {
  BookOpen,
  Briefcase,
  Code,
  Dumbbell,
  Footprints,
  GraduationCap,
  Heart,
  Inbox,
  Palette,
  Rocket,
  Video,
  type LucideIcon,
} from "lucide-react";
import { goalColor } from "@/lib/goals/colors";
import type { GoalIconName, GoalLook } from "@/lib/goals/style";

/** The prototype's ten goal icons, by the names the database stores. */
export const GOAL_ICONS: Record<GoalIconName, LucideIcon> = {
  rocket: Rocket,
  footprints: Footprints,
  heart: Heart,
  video: Video,
  book: BookOpen,
  dumbbell: Dumbbell,
  briefcase: Briefcase,
  graduation: GraduationCap,
  palette: Palette,
  code: Code,
};

const SIZES = {
  xs: { box: "size-5 rounded-md", icon: "size-3" },
  sm: { box: "size-6 rounded-md", icon: "size-3.5" },
  md: { box: "size-7 rounded-lg", icon: "size-4" },
  lg: { box: "size-8 rounded-lg", icon: "size-[18px]" },
  /** The goal setup's review and celebration (spec 42). */
  xl: { box: "size-14 rounded-2xl", icon: "size-7" },
} as const;

export function GoalTile({
  look,
  size = "md",
  className = "",
  inbox = false,
}: {
  /** The goal's colour and icon; null for "No goal". */
  look: GoalLook | null;
  size?: keyof typeof SIZES;
  className?: string;
  /** Draws an inbox tray instead (the Inbox section, spec 11). */
  inbox?: boolean;
}) {
  const tint = look === null ? "bg-raised text-ink-3" : goalColor(look.color).tile;
  const Icon = inbox ? Inbox : look === null ? Briefcase : GOAL_ICONS[look.icon];
  const { box, icon: iconClass } = SIZES[size];
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center ${box} ${tint} ${className}`}>
      <Icon className={iconClass} strokeWidth={2} />
    </span>
  );
}
