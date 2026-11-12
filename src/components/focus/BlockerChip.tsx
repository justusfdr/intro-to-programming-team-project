// The blocker's small status chip on the Focus page, copied from the prototype's chip: a shield, a short
// status and a dot, linking to Settings, where the block list and the extension live (spec 12).
import Link from "next/link";
import { Shield, ShieldCheck } from "lucide-react";
import { localTimeOf } from "@/lib/time/zoned";
import { fmtTime, type TimeFormat } from "@/lib/time/display";
import type { BlockerData } from "@/lib/blocker/types";

/** The chip's text: R18 (connected) and R15 (blocking now, until when) in words. */
export function blockerChipText(data: BlockerData, format: TimeFormat): string {
  if (!data.connected) return "Blocker not connected";
  if (data.blockingOn && data.blockingUntil) {
    return `Blocking until ${fmtTime(localTimeOf(new Date(data.blockingUntil), data.timeZone), format)}`;
  }
  const count = data.sites.length;
  return `${count} ${count === 1 ? "site" : "sites"} on your block list`;
}

export function BlockerChip({ data, format }: { data: BlockerData; format: TimeFormat }) {
  const Icon = data.connected ? ShieldCheck : Shield;
  return (
    <Link
      href="/settings#blocker"
      className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-line-subtle bg-surface px-3 text-xs text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
    >
      <Icon className="size-3.5 shrink-0 text-ink-3" strokeWidth={2} aria-hidden="true" />
      <span className="truncate">{blockerChipText(data, format)}</span>
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${data.connected ? (data.blockingOn ? "bg-success" : "bg-ink-3") : "bg-danger"}`}
      />
      <span className="sr-only">, open the blocker settings</span>
    </Link>
  );
}
