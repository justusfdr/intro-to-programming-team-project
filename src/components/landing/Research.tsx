"use client";

// "The research" on the landing page (spec 48): what the library is, three popular claims with a
// verdict, and the nine articles as tiles. A tile or a claim opens its article in a reading window
// on the page itself: no new address is opened to visitors, and the page links nowhere new. The
// guides are left out, because they explain screens a visitor cannot open.
//
// Without JavaScript the section reads the same; only the reading window needs it. The window's
// content is drawn when it opens, so its bars grow and its steps arrive then.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, X } from "lucide-react";
import { BodyBlock, sectionTitle } from "@/components/library/ArticleView";
import { LANDING_PATTERN, StudyBento } from "@/components/library/Bento";
import { TOPIC_LOOK } from "@/components/library/look";
import { TopicScene } from "@/components/library/scenes";
import { StudyCard } from "@/components/library/StudyCard";
import { LinkButton } from "@/components/ui/Button";
import { ARTICLES } from "@/lib/library/articles";
import { CLAIMS } from "@/lib/library/before-you-start";
import { articleBySlug, metaLine, readNext, studiesOf, tileOf, tilesOf, topicLabel } from "@/lib/library/library";
import { STUDIES } from "@/lib/library/studies";
import type { Article, Claim } from "@/lib/library/types";
import { Scene } from "./Scene";

const wrap = "mx-auto w-full max-w-[1160px] px-5 md:px-8";
const eyebrow = "text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30";
/** When a part of the section rises into place, in milliseconds (src/app/home/landing.css). */
const timing = (d: number) => ({ "--d": d }) as CSSProperties;

/**
 * The nine articles in the order of the tiles: the phone as the large one, the two tall ones with
 * steps and numbers, the two wide ones with bars. Every article with a study is here once.
 */
export const RESEARCH_ORDER = [
  "the-phone-on-your-desk",
  "where-the-23-minutes-come-from",
  "2-8-seconds",
  "a-small-speed-bump",
  "decide-before-the-moment",
  "faster-and-more-stressed",
  "what-happens-when-people-log-off",
  "short-videos-and-attention",
  "the-task-you-left-is-still-open",
] as const;

const TILES = tilesOf(RESEARCH_ORDER);
/** Articles with a study; the guides are for people who have an account. */
const hasStudy = (article: Article) => article.studies.length > 0;
const ARTICLE_COUNT = ARTICLES.filter(hasStudy).length;

const VERDICT: Record<Claim["verdict"], string> = {
  "Half true": "bg-warning-soft text-warning",
  "Not confirmed": "bg-raised text-ink-2",
  "Not shown": "bg-raised text-ink-2",
};

/** One article in the reading window. `onOpen` moves on to another article without closing it. */
export function Reader({ article, onClose, onOpen }: { article: Article; onClose: () => void; onOpen: (slug: string) => void }) {
  const look = TOPIC_LOOK[article.topic];
  const studies = studiesOf(article);
  const next = readNext(article, ARTICLES.length).filter(hasStudy).slice(0, 2).map(tileOf);
  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line-subtle bg-surface/95 py-2.5 pr-3 pl-5 backdrop-blur md:pl-8">
        <p className={eyebrow}>The research · {topicLabel(article.topic)}</p>
        <button type="button" onClick={onClose} aria-label="Close" className={`flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-raised hover:text-ink ${focusRing}`}>
          <X className="size-4" strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      <div className="px-5 pt-5 pb-8 md:px-8 md:pb-10">
        <header className={`relative overflow-hidden rounded-panel p-6 md:p-8 ${look.tint}`}>
          {/* In the lower corner, clear of the title; phones have no room for it. */}
          <TopicScene topic={article.topic} labels={false} className="absolute right-2 bottom-2 hidden w-52 sm:block" />
          <h2 id="reader-title" className="relative max-w-[20ch] text-[28px] leading-[34px] font-semibold tracking-display text-ink md:text-[34px] md:leading-10">
            {article.title}
          </h2>
          <p className="relative mt-3 max-w-[46ch] text-[16px] leading-6 text-ink-2 sm:pr-48">{article.dek}</p>
          <p className="relative mt-4 text-xs text-ink-2">{metaLine(article)}</p>
        </header>

        <div className="mt-7 flex flex-col gap-5">
          {article.body.map((block, index) => (
            <BodyBlock
              key={index}
              block={block}
              guide={false}
              heading="h3"
              action={
                <LinkButton href="/sign-up" className="mt-4">
                  Start for free
                </LinkButton>
              }
            />
          ))}
        </div>

        <section aria-labelledby="reader-studies" className="mt-10">
          <h3 id="reader-studies" className={sectionTitle}>
            Studies and publications
          </h3>
          <p className="mt-1 text-sm text-ink-2">Every number above comes from these. Open them and check.</p>
          <ul className="mt-4 flex flex-col gap-3">
            {studies.map((study) => (
              <StudyCard key={study.id} study={study} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="reader-next" className="mt-10">
          <h3 id="reader-next" className={`${sectionTitle} mb-4`}>
            Read next
          </h3>
          <StudyBento tiles={next} pattern={["square", "square"]} onOpen={onOpen} label="Read next" />
        </section>
      </div>
    </>
  );
}

export function Research() {
  // The address of the article in the reading window, or none while it is closed.
  const [slug, setSlug] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const article = slug ? articleBySlug(slug) : null;

  // The native dialog follows the state: focus stays inside it and returns to the tile afterwards.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (article && !element.open) element.showModal();
    if (!article && element.open) element.close();
  }, [article]);

  function open(next: string) {
    setSlug(next);
    // Another article from "Read next" starts at its top.
    dialog.current?.scrollTo({ top: 0 });
  }

  return (
    <section id="research" aria-labelledby="research-title">
      <div className={`${wrap} py-20 md:py-28`}>
        <Scene className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:items-end lg:gap-16">
          <div>
            <p className="l-rise text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">The research</p>
            <h2 id="research-title" className="l-rise mt-5 max-w-[16ch] text-[32px] leading-[1.1] font-semibold tracking-heading text-ink md:text-[40px]" style={timing(80)}>
              Every claim here has a study you can open.
            </h2>
            <p className="l-rise mt-5 max-w-[52ch] text-[17px] leading-7 text-ink-2" style={timing(160)}>
              Short articles on interruptions, phones and what helps. Each one lists its studies and says what they cannot show. Some popular numbers do not survive
              the check.
            </p>
            <p className="l-rise mt-4 text-sm text-ink-3" style={timing(220)}>
              {ARTICLE_COUNT} articles · {STUDIES.length} studies
            </p>
          </div>

          <div className="l-rise rounded-card border border-line-subtle bg-surface p-2" style={timing(260)}>
            <h3 className={`${eyebrow} px-3 pt-3 pb-1.5`}>Three claims, checked</h3>
            <ul>
              {CLAIMS.map((claim) => (
                <li key={claim.slug}>
                  <button
                    type="button"
                    onClick={() => open(claim.slug)}
                    aria-haspopup="dialog"
                    className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-raised ${focusRing}`}
                  >
                    <span className={`w-[104px] shrink-0 rounded-md py-0.5 text-center text-[11px] font-semibold uppercase tracking-[0.04em] ${VERDICT[claim.verdict]}`}>
                      {claim.verdict}
                    </span>
                    <span className="min-w-0 flex-1 text-sm leading-5 text-ink">“{claim.quote}”</span>
                    <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Scene>

        {/* A scene of its own: the tiles' bars and drawings wait until the tiles themselves are in view. */}
        <Scene className="mt-12" inset={10}>
          <StudyBento tiles={TILES} pattern={LANDING_PATTERN} onOpen={open} label="Articles on attention and distraction" />
        </Scene>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby="reader-title"
        onClose={() => setSlug(null)}
        // A click beside the window lands on the dialog itself (its backdrop), not on anything in it.
        onClick={(event) => {
          if (event.target === event.currentTarget) setSlug(null);
        }}
        className="reader m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-panel bg-surface p-0 text-ink shadow-pop md:m-auto md:max-h-[88dvh] md:max-w-[760px] md:rounded-panel"
      >
        {article && <Reader key={article.slug} article={article} onClose={() => setSlug(null)} onOpen={open} />}
      </dialog>
    </section>
  );
}
