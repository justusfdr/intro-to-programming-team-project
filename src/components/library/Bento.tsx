// The library's articles as tiles of four sizes (spec 48): one large with the shelf's drawing,
// tall ones with a picture under the number, wide ones with the picture beside it, and square
// ones with the number alone. A tile draws what its article has: bars, steps or two or three
// numbers, each value written out. On the Focus page a tile leads to the article with a link; on
// the landing page a button opens the article in the reading window.
//
// The sizes follow the room the tiles themselves have (container queries), not the screen, so
// the same grid works next to the app's sidebar and on the landing page.
import type { CSSProperties } from "react";
import Link from "next/link";
import { articleHref } from "@/lib/library/href";
import { topicLabel } from "@/lib/library/library";
import type { Teaser, Tile, TilePicture } from "@/lib/library/types";
import { TOPIC_LOOK } from "./look";
import { TopicScene } from "./scenes";

export type TileSize = "hero" | "tall" | "wide" | "square";

/** Seven tiles on the Focus page: two rows of the large, the tall and two square ones, then a wide one and two square ones. */
export const FOCUS_PATTERN: readonly TileSize[] = ["hero", "tall", "square", "square", "wide", "square", "square"];
/** Nine tiles on the landing page, four rows of four columns with no gap left. */
export const LANDING_PATTERN: readonly TileSize[] = ["hero", "tall", "square", "square", "tall", "wide", "square", "wide", "square"];

const eyebrow = "text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3";
const frame = "relative flex rounded-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-float";
/** The link or button of a tile: it lies over the whole tile, so the tile's own text stays plain text. */
const cover =
  "absolute inset-0 cursor-pointer rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

const SPAN: Record<TileSize, string> = {
  hero: "@lg:col-span-2 @4xl:row-span-2",
  tall: "@4xl:row-span-2",
  wide: "@lg:col-span-2",
  square: "",
};

/** A teaser has no line and no picture; as a tile it shows its number and title only. */
function asTile(item: Teaser | Tile): Tile {
  return "picture" in item ? item : { ...item, dek: "", label: null, picture: null };
}

const delay = (ms: number) => ({ animationDelay: `${ms}ms` }) as CSSProperties;

/** Bars from zero with every value written out; the ones the article is about are black. */
function MiniBars({ picture }: { picture: Extract<TilePicture, { kind: "bars" }> }) {
  const longest = Math.max(...picture.bars.map((bar) => bar.value));
  return (
    <div>
      <p className="text-xs leading-4 font-semibold text-ink">{picture.title}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {picture.bars.map((bar, index) => (
          <li key={bar.label}>
            <div className="flex items-baseline justify-between gap-3 text-xs leading-4">
              <span className="truncate text-ink-2">{bar.label}</span>
              <span className="shrink-0 font-semibold tabular text-ink">{bar.text}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-ink/8" aria-hidden="true">
              <div
                className={`library-bar h-1.5 rounded-full ${bar.strong ? "bg-ink" : "bg-ink/30"}`}
                style={{ width: `${Math.max(2, (bar.value / longest) * 100)}%`, ...delay(index * 110) }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What happens, one thing after the other, on a line from top to bottom. */
function MiniSteps({ picture }: { picture: Extract<TilePicture, { kind: "steps" }> }) {
  return (
    <ol className="flex flex-col">
      {picture.steps.map((step, index) => (
        <li key={step} className="library-step relative flex items-start gap-2.5 pb-2.5 last:pb-0" style={delay(index * 140)}>
          {index < picture.steps.length - 1 && <span aria-hidden="true" className="absolute top-5 bottom-0 left-[9px] w-px bg-ink/20" />}
          <span className="relative flex size-[19px] shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-semibold tabular text-white">
            {index + 1}
          </span>
          <span className="text-[13px] leading-[19px] text-ink">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** Two or three numbers, each with what it counts. */
function MiniStats({ picture }: { picture: Extract<TilePicture, { kind: "stats" }> }) {
  return (
    <dl className="flex flex-col gap-2">
      {picture.stats.map((stat, index) => (
        <div key={stat.label} className="library-step flex items-baseline gap-2.5" style={delay(index * 140)}>
          <dd className="w-14 shrink-0 text-[17px] leading-5 font-semibold tracking-snug tabular text-ink">{stat.value}</dd>
          <dt className="text-xs leading-4 text-ink-2">{stat.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function Picture({ picture }: { picture: TilePicture }) {
  if (picture.kind === "bars") return <MiniBars picture={picture} />;
  if (picture.kind === "steps") return <MiniSteps picture={picture} />;
  return <MiniStats picture={picture} />;
}

/** The tile's number and what it counts; a guide has none and shows its shelf's icon instead. */
function Lead({ tile, size }: { tile: Tile; size: "lg" | "md" }) {
  const Icon = TOPIC_LOOK[tile.topic].icon;
  if (!tile.figure) return <Icon className="size-7 text-ink" strokeWidth={1.8} aria-hidden="true" />;
  return (
    <div>
      <p className={`font-semibold tracking-display tabular text-ink ${size === "lg" ? "text-[40px] leading-[44px]" : "text-[30px] leading-9"}`}>{tile.figure}</p>
      {tile.label && <p className="mt-1 text-[13px] leading-[18px] text-ink-2">{tile.label}</p>}
    </div>
  );
}

/** The article's title and how long it takes, at the foot of a tile. */
function Foot({ tile, showTitle = true }: { tile: Tile; showTitle?: boolean }) {
  return (
    <div className="mt-auto pt-3">
      <h3 className={showTitle ? "line-clamp-2 text-[13px] leading-[18px] font-semibold text-ink" : "sr-only"}>{tile.title}</h3>
      <p className="mt-0.5 text-xs leading-4 text-ink-3">{tile.meta}</p>
    </div>
  );
}

function Hero({ tile }: { tile: Tile }) {
  const look = TOPIC_LOOK[tile.topic];
  return (
    <div className="flex w-full flex-col rounded-card border border-line-subtle bg-surface">
      <div className={`flex min-h-40 flex-1 items-center justify-center rounded-t-[15px] px-4 ${look.tint}`}>
        <TopicScene topic={tile.topic} className="h-auto w-full max-w-[420px]" />
      </div>
      <div className="flex items-end gap-6 p-5">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className={eyebrow}>{topicLabel(tile.topic)}</p>
          <h3 className="mt-1.5 text-[20px] leading-[26px] font-semibold tracking-snug text-ink">{tile.title}</h3>
          {tile.dek && <p className="mt-1.5 line-clamp-3 text-sm leading-5 text-ink-2">{tile.dek}</p>}
          <p className="mt-3 text-xs leading-4 text-ink-3">{tile.meta}</p>
        </div>
        {/* The article's number beside the words, where the tile is wide enough for both. */}
        {tile.figure && (
          <div className="hidden w-40 shrink-0 @lg:block">
            <Lead tile={tile} size="md" />
          </div>
        )}
      </div>
    </div>
  );
}

function Tall({ tile }: { tile: Tile }) {
  const look = TOPIC_LOOK[tile.topic];
  return (
    <div className={`flex w-full flex-col rounded-card p-[18px] ${look.tint}`}>
      <TopicScene topic={tile.topic} labels={false} className="-mx-1 mb-2 h-auto w-[calc(100%+0.5rem)] max-w-[260px]" />
      <Lead tile={tile} size="lg" />
      {tile.picture && (
        <div className="mt-4">
          <Picture picture={tile.picture} />
        </div>
      )}
      <Foot tile={tile} />
    </div>
  );
}

function Wide({ tile }: { tile: Tile }) {
  return (
    <div className="flex w-full flex-col gap-4 rounded-card border border-line-subtle bg-surface p-[18px] @lg:flex-row @lg:gap-6">
      <div className="flex flex-col @lg:w-[42%] @lg:shrink-0">
        <p className={`${eyebrow} mb-1.5`}>{topicLabel(tile.topic)}</p>
        <Lead tile={tile} size="md" />
        <Foot tile={tile} />
      </div>
      {tile.picture && (
        <div className="min-w-0 flex-1 self-center">
          <Picture picture={tile.picture} />
        </div>
      )}
    </div>
  );
}

function Square({ tile, tinted }: { tile: Tile; tinted: boolean }) {
  const look = TOPIC_LOOK[tile.topic];
  const Icon = look.icon;
  return (
    <div className={`relative flex min-h-44 w-full flex-col rounded-card p-[18px] ${tinted ? look.tint : "border border-line-subtle bg-surface"}`}>
      {tile.figure && <Icon className={`absolute top-[18px] right-[18px] size-4 ${tinted ? "text-ink/40" : look.mark}`} strokeWidth={2} aria-hidden="true" />}
      <Lead tile={tile} size="md" />
      {/* A guide has no number, so its title is what the tile says. */}
      <Foot tile={tile} showTitle={!tile.figure} />
    </div>
  );
}

function Body({ tile, size, tinted }: { tile: Tile; size: TileSize; tinted: boolean }) {
  if (size === "hero") return <Hero tile={tile} />;
  if (size === "tall") return <Tall tile={tile} />;
  if (size === "wide") return <Wide tile={tile} />;
  return <Square tile={tile} tinted={tinted} />;
}

/**
 * `pattern`: the size of each tile, in order; tiles beyond it are square. `onOpen`: when given,
 * a tile opens its article with a button that calls it with the article's address; otherwise
 * with a link to the article. Button or link lie over the whole tile.
 */
export function StudyBento({
  tiles,
  pattern,
  onOpen,
  label,
}: {
  tiles: readonly (Teaser | Tile)[];
  pattern: readonly TileSize[];
  onOpen?: (slug: string) => void;
  /** What the list is, for screen readers. */
  label: string;
}) {
  let squares = 0;
  return (
    <div className="@container">
      <ul aria-label={label} className="grid grid-flow-dense grid-cols-1 gap-4 @lg:grid-cols-2 @4xl:auto-rows-[208px] @4xl:grid-cols-4">
        {tiles.map((item, index) => {
          const tile = asTile(item);
          const size = pattern[index] ?? "square";
          // Every second square tile carries its shelf's tint, so the grid is not all white.
          const tinted = size === "square" && squares++ % 2 === 1;
          return (
            <li key={tile.slug} className={`${frame} ${SPAN[size]}`}>
              <Body tile={tile} size={size} tinted={tinted} />
              {onOpen ? (
                <button type="button" onClick={() => onOpen(tile.slug)} aria-haspopup="dialog" className={cover}>
                  <span className="sr-only">Read: {tile.title}</span>
                </button>
              ) : (
                <Link href={articleHref(tile.slug)} className={cover}>
                  <span className="sr-only">Read: {tile.title}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
