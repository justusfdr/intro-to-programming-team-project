// One article of the library (spec 29): a header on the shelf's tint, the text with its pictures,
// what the study cannot show, what to do with it, then the studies themselves and what to read next.
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { LIBRARY_HREF, shelfHref } from "@/lib/library/href";
import { metaLine, readNext, studiesOf, topicLabel } from "@/lib/library/library";
import type { Article, Block } from "@/lib/library/types";
import { ArticleTile, eyebrow } from "./ArticleTile";
import { BarsFigure, StatRow, StepsFigure } from "./Figures";
import { TOPIC_LOOK, TopicMotif } from "./look";
import { StudyCard } from "./StudyCard";

export const sectionTitle = "text-[20px] leading-7 font-semibold tracking-heading text-ink";

/**
 * One piece of an article's text. `action`: what stands under "Try it"; inside the app the way
 * to a session, on the landing page the way to an account (spec 48). `heading`: the level of a
 * heading inside the text, one below the article's own title.
 */
export function BodyBlock({ block, guide, action, heading: Heading = "h2" }: { block: Block; guide: boolean; action?: ReactNode; heading?: "h2" | "h3" }) {
  switch (block.kind) {
    case "p":
      return <p className="text-[16px] leading-7 text-ink">{block.text}</p>;
    case "h":
      return <Heading className={`${sectionTitle} pt-3`}>{block.text}</Heading>;
    case "stats":
      return <StatRow stats={block.stats} />;
    case "bars":
      return <BarsFigure title={block.title} bars={block.bars} note={block.note} />;
    case "steps":
      return <StepsFigure title={block.title} steps={block.steps} />;
    case "limits":
      return (
        <aside className="border-l-2 border-line pl-4">
          <p className={eyebrow}>{guide ? "Good to know" : "What this cannot tell you"}</p>
          <p className="mt-1.5 text-sm leading-6 text-ink-2">{block.text}</p>
        </aside>
      );
    case "try":
      return (
        <aside className="rounded-card bg-raised p-5">
          <p className={eyebrow}>Try it</p>
          <p className="mt-1.5 text-[15px] leading-6 text-ink">{block.text}</p>
          {action ?? (
            <Link href="/focus" className={buttonClass("primary", "md", "mt-4")}>
              <Play className="size-4" aria-hidden="true" />
              Start a session
            </Link>
          )}
        </aside>
      );
  }
}

export function ArticleView({ article }: { article: Article }) {
  const look = TOPIC_LOOK[article.topic];
  const studies = studiesOf(article);
  const guide = studies.length === 0;
  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-6 md:px-8 md:py-10">
      <Link
        href={LIBRARY_HREF}
        className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Library
      </Link>

      <header className={`relative mt-4 overflow-hidden rounded-panel p-6 md:p-9 ${look.tint}`}>
        {/* In the lower corner, clear of the title; phones have no room for it. */}
        <TopicMotif topic={article.topic} className="absolute right-5 bottom-5 hidden w-40 sm:block" />
        <Link href={shelfHref(article.topic)} className={`${eyebrow} relative rounded text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30`}>
          {topicLabel(article.topic)}
        </Link>
        <h1 className="relative mt-2 max-w-[20ch] text-[30px] leading-9 font-semibold tracking-display text-ink md:text-[40px] md:leading-[46px]">
          {article.title}
        </h1>
        <p className="relative mt-3 max-w-[52ch] text-[17px] leading-7 text-ink-2 sm:pr-44">{article.dek}</p>
        <p className="relative mt-5 text-xs text-ink-2">{metaLine(article)}</p>
      </header>

      <div className="mt-8 flex flex-col gap-5">
        {article.body.map((block, index) => (
          <BodyBlock key={index} block={block} guide={guide} />
        ))}
      </div>

      {studies.length > 0 && (
        <section aria-labelledby="studies-title" className="mt-12">
          <h2 id="studies-title" className={sectionTitle}>
            Studies and publications
          </h2>
          <p className="mt-1 text-sm text-ink-2">Every number above comes from these. Open them and check.</p>
          <ul className="mt-4 flex flex-col gap-3">
            {studies.map((study) => (
              <StudyCard key={study.id} study={study} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="next-title" className="mt-12">
        <h2 id="next-title" className={sectionTitle}>
          Read next
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {readNext(article).map((next) => (
            <ArticleTile key={next.slug} article={next} />
          ))}
        </div>
      </section>
    </article>
  );
}
