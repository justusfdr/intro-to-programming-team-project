// One article as a tile (spec 29): its number on the shelf's tint, then shelf, title, a line of
// what it is about, and how long it takes. The whole tile is the link.
import Link from "next/link";
import { articleHref } from "@/lib/library/href";
import { metaLine, topicLabel } from "@/lib/library/library";
import type { Article } from "@/lib/library/types";
import { TOPIC_LOOK, TopicMotif } from "./look";

export const eyebrow = "text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3";

const frame =
  "group overflow-hidden rounded-card border border-line-subtle bg-surface transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

/** The tinted part of a tile: the article's number, or the shelf's icon for a guide. */
function TileArt({ article, large }: { article: Article; large: boolean }) {
  const look = TOPIC_LOOK[article.topic];
  const Icon = look.icon;
  return (
    <div className={`relative flex flex-col justify-end overflow-hidden p-5 ${look.tint} ${large ? "min-h-48 md:w-[46%] md:shrink-0 md:p-7" : "h-40"}`}>
      <TopicMotif topic={article.topic} className={`absolute right-3 top-4 ${large ? "w-40" : "w-28"}`} />
      {article.figure ? (
        <>
          <p className={`relative font-semibold tracking-display tabular text-ink ${large ? "text-[44px] leading-[48px]" : "text-[32px] leading-9"}`}>
            {article.figure.value}
          </p>
          <p className="relative mt-1 max-w-[30ch] text-xs leading-4 text-ink-2">{article.figure.label}</p>
        </>
      ) : (
        <Icon className="relative size-7 text-ink" strokeWidth={1.8} aria-hidden="true" />
      )}
    </div>
  );
}

/** `large`: the first tile of the library, across two columns with the number beside the text. */
export function ArticleTile({ article, large = false }: { article: Article; large?: boolean }) {
  return (
    <Link href={articleHref(article.slug)} className={`${frame} flex flex-col ${large ? "md:col-span-2 md:flex-row" : ""}`}>
      <TileArt article={article} large={large} />
      <div className={`flex flex-1 flex-col p-5 ${large ? "md:justify-center md:p-7" : ""}`}>
        <p className={eyebrow}>{topicLabel(article.topic)}</p>
        <h3 className={`mt-1.5 font-semibold tracking-snug text-ink ${large ? "text-[22px] leading-7" : "text-[17px] leading-6"}`}>{article.title}</h3>
        <p className="mt-1.5 text-sm leading-5 text-ink-2">{article.dek}</p>
        <p className="mt-auto pt-4 text-xs text-ink-3">{metaLine(article)}</p>
      </div>
    </Link>
  );
}
