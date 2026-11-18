// One study under an article (spec 29): where and when it was published, its title, how it got
// its result, who wrote it, and the link to the publication itself.
import { ArrowUpRight } from "lucide-react";
import type { Study } from "@/lib/library/types";
import { eyebrow } from "./ArticleTile";

const chip = "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]";

export function StudyCard({ study }: { study: Study }) {
  return (
    <li className="rounded-card border border-line-subtle bg-surface p-5">
      <p className={eyebrow}>
        {study.year} · {study.venue}
      </p>
      <p className="mt-1.5 text-[15px] leading-6 font-semibold text-ink">{study.title}</p>
      <p className="mt-3 flex flex-wrap gap-1.5">
        {study.peerReviewed && <span className={`${chip} bg-success-soft text-success`}>Peer-reviewed</span>}
        <span className={`${chip} bg-raised text-ink-2`}>{study.kind}</span>
      </p>
      <p className="mt-3 text-sm text-ink-2">{study.authors}</p>
      <a
        href={study.url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 rounded text-sm font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
      >
        Publication
        <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden="true" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </li>
  );
}
