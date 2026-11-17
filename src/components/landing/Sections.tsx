// The lower half of the landing page (spec 45): why we built it, the tools it connects to, the two
// plans, the questions and the last invitation. The plans come from the same list as the pricing
// page inside the app, so the two can never disagree.
import type { ReactNode } from "react";
import { CalendarDays, CalendarSync, Check, MapPin, Plus, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { PLANS, type PlanInfo } from "@/lib/billing/plans";
import { QUESTIONS, TOOLS, type Tool } from "./content";
import { timing } from "./mocks/parts";
import { Scene } from "./Scene";
import { Eyebrow } from "./Steps";

const wrap = "mx-auto w-full max-w-[1160px] px-5 md:px-8";
const title = "text-[32px] leading-[1.1] font-semibold tracking-heading text-ink md:text-[40px]";

/** Why we built it: one of the founders, in his own words. */
export function Founder() {
  return (
    <section id="why" aria-labelledby="why-title" className="border-y border-line-subtle bg-surface">
      <Scene className={`${wrap} grid grid-cols-1 gap-10 py-20 md:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16`}>
        <div>
          <Eyebrow className="l-rise">Why we built it</Eyebrow>
          <h2 id="why-title" className="sr-only">
            Why we built LockedIn
          </h2>
        </div>
        <figure>
          <blockquote className="l-rise text-[26px] leading-[1.3] font-medium tracking-heading text-ink md:text-[34px] md:leading-[1.25]" style={timing({ d: 80 })}>
            <p>
              “I had a calendar full of meetings and a head full of goals, and the two never met. We built LockedIn so the things that matter get a time, and
              that time gets protected.”
            </p>
          </blockquote>
          <figcaption className="l-rise mt-8 flex items-center gap-3" style={timing({ d: 180 })}>
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
              JF
            </span>
            <span>
              <span className="block text-[15px] font-semibold tracking-snug text-ink">Justus Friederichs</span>
              <span className="block text-sm text-ink-2">Co-founder of LockedIn</span>
            </span>
          </figcaption>
        </figure>
      </Scene>
    </section>
  );
}

/** Each tool's icon in a soft tile of its own colour, like the tiles of the goals. */
const TOOL_LOOK: Record<Tool["id"], { icon: LucideIcon; tile: string }> = {
  outlook: { icon: CalendarSync, tile: "bg-sky-50 text-sky-700" },
  "google-calendar": { icon: CalendarDays, tile: "bg-indigo-50 text-indigo-700" },
  chrome: { icon: ShieldCheck, tile: "bg-amber-50 text-amber-800" },
  maps: { icon: MapPin, tile: "bg-emerald-50 text-emerald-700" },
};

function ToolCard({ tool, index }: { tool: Tool; index: number }) {
  const look = TOOL_LOOK[tool.id];
  return (
    <li className="l-rise flex flex-col rounded-card border border-line-subtle bg-surface p-5" style={timing({ d: 160 + index * 80 })}>
      <div className="flex items-center justify-between gap-2">
        <span aria-hidden className={`flex size-10 items-center justify-center rounded-xl ${look.tile}`}>
          <look.icon className="size-5" strokeWidth={2} />
        </span>
        {tool.soon ? (
          <span className="inline-flex h-6 items-center rounded-full bg-raised px-2.5 text-[11px] font-medium text-ink-2">{tool.status}</span>
        ) : (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-[11px] font-medium text-success">
            <span aria-hidden className="l-live size-1.5 rounded-full bg-success" />
            {tool.status}
          </span>
        )}
      </div>
      <h3 className="mt-4 text-[15px] font-semibold tracking-snug text-ink">{tool.name}</h3>
      <p className="mt-1 text-sm leading-[22px] text-ink-2">{tool.text}</p>
    </li>
  );
}

export function Tools() {
  return (
    <section id="tools" aria-labelledby="tools-title">
      <Scene className={`${wrap} py-20 md:py-28`}>
        <div className="max-w-[36rem]">
          <Eyebrow className="l-rise">Connections</Eyebrow>
          <h2 id="tools-title" className={`l-rise mt-4 ${title}`} style={timing({ d: 70 })}>
            Works with the tools you already use
          </h2>
          <p className="l-rise mt-4 text-[17px] leading-7 text-ink-2" style={timing({ d: 140 })}>
            Connect your calendar so the plan fits around what is really going on.
          </p>
        </div>
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map((tool, index) => (
            <ToolCard key={tool.id} tool={tool} index={index} />
          ))}
        </ul>
      </Scene>
    </section>
  );
}

/** A tick before a feature: quiet grey for Free, filled black for Pro (as on the pricing page in the app). */
function Tick({ strong }: { strong: boolean }) {
  return strong ? (
    <span aria-hidden className="mt-px inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-ink text-white">
      <Check className="size-3" strokeWidth={3} />
    </span>
  ) : (
    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={2} />
  );
}

function PlanCard({ info, strong, children }: { info: PlanInfo; strong: boolean; children: ReactNode }) {
  return (
    <section
      aria-labelledby={`landing-plan-${info.id}`}
      className={`relative flex flex-col rounded-card bg-surface p-6 md:p-7 ${strong ? "border-2 border-ink shadow-float" : "border border-line-subtle"}`}
    >
      {strong && (
        <span className="absolute -top-3 left-6 inline-flex h-6 items-center gap-1 rounded-full bg-ink px-2.5 text-[11px] font-semibold text-white">
          <Sparkles className="size-3" aria-hidden="true" />
          With the coach
        </span>
      )}
      <h3 id={`landing-plan-${info.id}`} className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${strong ? "text-ink" : "text-ink-3"}`}>
        {info.name}
      </h3>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[44px] leading-none font-semibold tracking-heading text-ink tabular">{info.price}</span>
        <span className="text-sm text-ink-3">{info.per}</span>
      </p>
      <p className="mt-3 text-sm text-ink-2">{info.summary}</p>
      <ul className="mt-5 flex flex-1 flex-col gap-2.5 text-sm text-ink">
        {info.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Tick strong={strong} />
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-7">{children}</div>
    </section>
  );
}

export function Plans() {
  const [free, pro] = PLANS;
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="border-y border-line-subtle bg-surface">
      <Scene className={`${wrap} grid grid-cols-1 gap-10 py-20 md:py-28 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16`}>
        <div>
          <Eyebrow className="l-rise">Pricing</Eyebrow>
          <h2 id="pricing-title" className={`l-rise mt-4 ${title}`} style={timing({ d: 70 })}>
            Free to plan.
            <br />
            {`${pro.price} for a coach.`}
          </h2>
          <p className="l-rise mt-4 max-w-[26rem] text-[17px] leading-7 text-ink-2" style={timing({ d: 140 })}>
            The calendar, your goals, focus sessions and the site blocker cost nothing. Pay only if you want the coach to plan with you, and cancel whenever
            you like.
          </p>
        </div>
        <div className="l-rise grid grid-cols-1 items-stretch gap-4 pt-3 md:grid-cols-2" style={timing({ d: 200 })}>
          <PlanCard info={free} strong={false}>
            <LinkButton href="/sign-up" variant="secondary" size="lg" className="w-full">
              Start for free
            </LinkButton>
            <p className="mt-2 text-center text-xs text-ink-3">No credit card needed</p>
          </PlanCard>
          <PlanCard info={pro} strong>
            <LinkButton href="/sign-up" size="lg" className="w-full">
              Get started with Pro
            </LinkButton>
            <p className="mt-2 text-center text-xs text-ink-3">Create your account, then upgrade inside · Cancel anytime</p>
          </PlanCard>
        </div>
      </Scene>
    </section>
  );
}

export function Questions() {
  return (
    <section id="faq" aria-labelledby="faq-title">
      <Scene className={`${wrap} grid grid-cols-1 gap-10 py-20 md:py-28 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16`}>
        <div>
          <Eyebrow className="l-rise">FAQ</Eyebrow>
          <h2 id="faq-title" className={`l-rise mt-4 ${title}`} style={timing({ d: 70 })}>
            Good to know before you start
          </h2>
        </div>
        <div className="l-rise border-t border-line-subtle" style={timing({ d: 160 })}>
          {QUESTIONS.map((item, index) => (
            // One name for all: opening a question closes the one that was open.
            <details key={item.question} name="landing-faq" open={index === 0} className="group border-b border-line-subtle">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-5 text-[17px] font-semibold tracking-snug text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 [&::-webkit-details-marker]:hidden">
                {item.question}
                <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-ink-2 transition-colors group-hover:bg-muted">
                  <Plus className="l-faq-plus size-4" strokeWidth={2.2} />
                </span>
              </summary>
              <p className="l-answer max-w-[40rem] pb-6 pr-10 text-[15px] leading-7 text-ink-2">{item.answer}</p>
            </details>
          ))}
        </div>
      </Scene>
    </section>
  );
}

/** The last invitation: the one dark panel on the page. */
export function LastCall() {
  return (
    <section aria-labelledby="last-title" className={`${wrap} pb-20 md:pb-28`}>
      <Scene className="relative overflow-hidden rounded-panel bg-ink px-6 py-14 text-center md:px-12 md:py-20">
        {/* The app's mark, large and faint, behind the words. */}
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[1180px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.14]" />
        <div className="relative">
          <h2 id="last-title" className="l-rise text-[34px] leading-[1.08] font-semibold tracking-display text-white md:text-[52px]">
            Your week is waiting.
            <br />
            Lock it in.
          </h2>
          <p className="l-rise mx-auto mt-4 max-w-[28rem] text-[17px] leading-7 text-white/70" style={timing({ d: 90 })}>
            Set up your first goal in a few minutes and see the week fall into place.
          </p>
          <div className="l-rise mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3" style={timing({ d: 180 })}>
            <Link
              href="/sign-up"
              className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-ink transition-[background-color,transform] duration-150 hover:bg-white/90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              Start for free
            </Link>
            <Link
              href="/sign-in"
              className="rounded-sm text-sm font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              I already have an account
            </Link>
          </div>
        </div>
      </Scene>
    </section>
  );
}
