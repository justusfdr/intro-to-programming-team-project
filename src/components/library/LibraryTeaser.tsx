// Three articles of the library on the Focus page (spec 29), for the time before or after a session.
// It gets only what a row needs, so the Focus page does not carry the articles' text.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { articleHref, LIBRARY_HREF } from "@/lib/library/href";
import type { Teaser } from "@/lib/library/types";
import { TOPIC_LOOK } from "./look";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30";

export function LibraryTeaser({ teasers }: { teasers: Teaser[] }) {
  return (
    <section aria-labelledby="library-title">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="library-title" className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">
          From the library
        </h2>
        <Link href={LIBRARY_HREF} className={`inline-flex items-center gap-1 rounded text-sm font-semibold text-ink hover:underline ${focusRing}`}>
          All articles
          <ArrowRight className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
        </Link>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {teasers.map((teaser) => {
          const look = TOPIC_LOOK[teaser.topic];
          const Icon = look.icon;
          return (
            <li key={teaser.slug}>
              <Link
                href={articleHref(teaser.slug)}
                className={`flex overflow-hidden rounded-card border border-line-subtle bg-surface transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-float ${focusRing}`}
              >
                <span className={`flex w-28 shrink-0 items-center justify-center p-3 text-center ${look.tint}`}>
                  {teaser.figure ? (
                    <span className="text-lg leading-6 font-semibold tracking-snug tabular text-ink">{teaser.figure}</span>
                  ) : (
                    <Icon className="size-6 text-ink" strokeWidth={1.8} aria-hidden="true" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3.5">
                  <span className="text-[15px] leading-5 font-semibold text-ink">{teaser.title}</span>
                  <span className="mt-1 text-xs text-ink-3">{teaser.meta}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
