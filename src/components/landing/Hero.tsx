// The first screen of the landing page (spec 45): what LockedIn is in one line, the two ways on, and
// the week view next to it, where the coach's focus blocks lock in while you look.
import { ArrowRight } from "lucide-react";
import { buttonClass, LinkButton } from "@/components/ui/Button";
import { timing } from "./mocks/parts";
import { WeekMock } from "./mocks/WeekMock";

export function Hero() {
  return (
    <section aria-labelledby="hero-title">
      <div className="mx-auto grid w-full max-w-[1160px] grid-cols-1 items-center gap-12 px-5 pb-20 pt-12 md:px-8 md:pt-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14 lg:pb-28">
        <div>
          <p className="l-rise inline-flex h-7 items-center gap-2 rounded-full border border-line-subtle bg-surface pl-2.5 pr-3 text-xs font-medium text-ink-2">
            <span aria-hidden className="size-1.5 rounded-full bg-today" />
            The calendar that thinks with you
          </p>
          <h1 id="hero-title" className="l-rise mt-5 text-[44px] leading-[1.04] font-semibold tracking-display text-ink sm:text-[56px] lg:text-[64px]" style={timing({ d: 80 })}>
            Lock in on
            <br />
            what matters.
          </h1>
          <p className="l-rise mt-5 max-w-[30rem] text-[17px] leading-7 text-ink-2" style={timing({ d: 160 })}>
            Everything around you is built to pull you away. LockedIn is a calendar that pushes back: it plans your week around your goals, blocks time for
            deep work and keeps distractions out while you focus.
          </p>
          <div className="l-rise mt-8 flex flex-wrap items-center gap-3" style={timing({ d: 240 })}>
            <LinkButton href="/sign-up" size="lg" className="px-6">
              Start for free
              <ArrowRight className="size-4" aria-hidden="true" />
            </LinkButton>
            <a href="#how" className={buttonClass("secondary", "lg", "px-6")}>
              See how it works
            </a>
          </div>
          <p className="l-rise mt-4 text-[13px] text-ink-3" style={timing({ d: 320 })}>
            Free to start · No credit card · Works with Outlook
          </p>
        </div>

        <div className="l-rise min-w-0" style={timing({ d: 220 })}>
          <WeekMock />
        </div>
      </div>
    </section>
  );
}
