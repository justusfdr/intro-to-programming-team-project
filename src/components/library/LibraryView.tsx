// The library's front page (spec 29): the shelves as a filter, then every article as a tile.
// The filter is a row of links (`?topic=phones`), so reload and back work and nothing runs in the browser.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ARTICLES } from "@/lib/library/articles";
import { shelfHref } from "@/lib/library/href";
import { articlesOn, TOPICS } from "@/lib/library/library";
import { STUDIES } from "@/lib/library/studies";
import type { Topic } from "@/lib/library/types";
import { ArticleTile } from "./ArticleTile";

function Shelf({ topic, label, on }: { topic: Topic | null; label: string; on: boolean }) {
  return (
    <Link
      href={shelfHref(topic)}
      aria-current={on ? "page" : undefined}
      className={`flex h-8 items-center rounded-full px-3.5 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
        on ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-2 hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

export function LibraryView({ topic }: { topic: Topic | null }) {
  const articles = articlesOn(topic);
  const guides = ARTICLES.filter((article) => article.studies.length === 0).length;
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6 md:px-8 md:py-10">
      <Link
        href="/focus"
        className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Focus
      </Link>
      <h1 className="mt-3 text-[28px] leading-[34px] font-semibold tracking-display text-ink md:text-[32px] md:leading-[38px]">Library</h1>
      <p className="mt-1 max-w-[60ch] text-sm text-ink-2">
        Short reads on attention and distraction. Every number comes from a study you can open, and every article says what that study cannot show.
      </p>
      <p className="mt-2 text-xs text-ink-3">
        {ARTICLES.length - guides} articles · {STUDIES.length} studies · {guides} guides
      </p>

      <nav aria-label="Shelves" className="scroll-thin mt-6 -mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
        <div className="inline-flex rounded-full bg-raised p-1">
          <Shelf topic={null} label="All" on={topic === null} />
          {TOPICS.map((shelf) => (
            <Shelf key={shelf.id} topic={shelf.id} label={shelf.label} on={topic === shelf.id} />
          ))}
        </div>
      </nav>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {articles.map((article, index) => (
          // The first tile of the whole library is the large one; a single shelf shows equal tiles.
          <ArticleTile key={article.slug} article={article} large={topic === null && index === 0} />
        ))}
      </div>
    </div>
  );
}
