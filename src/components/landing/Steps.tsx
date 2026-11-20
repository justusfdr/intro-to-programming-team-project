// "How it works" (spec 45, spec 62): the idea in one sentence, then one day in six stops
// (DayStory.tsx). Plan, Focus and Reach, the three steps of spec 45, are three of them.
import { Lock, Mail, MessageSquare, Play, ShoppingBag, TrendingUp, type LucideIcon } from "lucide-react";
import { DayStory } from "./DayStory";
import { Eyebrow } from "./Eyebrow";
import { timing } from "./mocks/parts";
import { Scene } from "./Scene";

export { Eyebrow };

/** What shouts for attention on a normal day. Each gets struck through; one protected block remains. */
const NOISE: { icon: LucideIcon; text: string }[] = [
  { icon: MessageSquare, text: "3 new messages" },
  { icon: Play, text: "Up next in 5 seconds" },
  { icon: TrendingUp, text: "Trending now" },
  { icon: Mail, text: "12 unread" },
  { icon: ShoppingBag, text: "Sale ends today" },
];
const STRIKE_AT = 950;
const STRIKE_GAP = 150;

export function Steps() {
  return (
    <section id="how" aria-labelledby="how-title">
      <div className="border-y border-line-subtle bg-surface">
        <Scene className="mx-auto w-full max-w-[1160px] px-5 py-16 md:px-8 md:py-24">
          <Eyebrow className="l-rise">How it works</Eyebrow>
          <h2 id="how-title" className="l-rise mt-5 max-w-[60rem] text-[28px] leading-[1.2] font-semibold tracking-heading text-ink-3 md:text-[40px] md:leading-[1.15]" style={timing({ d: 80 })}>
            Notifications, open tabs, one quick check: most days go to whatever shouts loudest.{" "}
            <span className="text-ink">LockedIn gives your time a plan, and then guards it.</span>
          </h2>
          <ul aria-hidden className="mt-10 flex flex-wrap items-center gap-2">
            {NOISE.map((noise, index) => (
              <li key={noise.text} className="l-rise" style={timing({ d: 260 + index * 70 })}>
                <span className="relative inline-flex h-9 items-center gap-2 rounded-full border border-line-subtle bg-canvas px-3.5 text-[13px] text-ink-3">
                  <noise.icon className="size-3.5" strokeWidth={2} />
                  {noise.text}
                  <span className="l-grow absolute inset-x-3 top-1/2 h-px bg-ink-3" style={timing({ d: STRIKE_AT + index * STRIKE_GAP })} />
                </span>
              </li>
            ))}
            <li className="l-pop" style={timing({ d: STRIKE_AT + NOISE.length * STRIKE_GAP + 150 })}>
              <span className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-3.5 text-[13px] font-medium text-white">
                <Lock className="size-3.5" strokeWidth={2.2} />
                9:00 – 11:00 · Thesis
              </span>
            </li>
          </ul>
        </Scene>
      </div>

      <DayStory />
    </section>
  );
}
