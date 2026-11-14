"use client";

// The pricing page (spec 24): Free and Pro side by side, in the app's own look (white cards, fine
// lines, black for the main action). Pro stands out: a black frame, "Most popular", filled black ticks
// and the coach's features; Free keeps quiet grey ticks. The current plan is marked.
// "Upgrade to Pro" asks our server for Stripe's checkout page and goes there; "Cancel Pro" lets the
// subscription end after the paid period. The page never changes the plan itself: after paying it only
// waits for Stripe's signed message to reach our server (R25), and looks again every two seconds.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, FlaskConical, Sparkles } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { checkoutNote, PLANS, type Plan, type PlanInfo } from "@/lib/billing/plans";
import { postJson } from "@/lib/client/post-json";
import { MESSAGES } from "@/lib/messages";

/** How often and how long the page looks again for the plan after paying. */
const RECHECK_MS = 2000;
const RECHECKS = 15;

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.08em]";

type Props = {
  plan: Plan;
  paymentReady: boolean;
  /** "success" or "cancelled" when Stripe sent the browser back. */
  checkout?: string;
  /** Starts at the "Cancel Pro?" question (static previews only). */
  defaultConfirming?: boolean;
};

/** A tick before a feature: quiet grey for Free, filled black for Pro. */
function Tick({ strong }: { strong: boolean }) {
  return strong ? (
    <span aria-hidden="true" className="mt-px inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-ink text-white">
      <Check className="size-3" strokeWidth={3} />
    </span>
  ) : (
    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={2} />
  );
}

function PlanHead({ info, current, strong }: { info: PlanInfo; current: boolean; strong: boolean }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 id={`plan-${info.id}`} className={`${eyebrow} ${strong ? "text-ink" : "text-ink-3"}`}>
          {info.name}
        </h2>
        {current && (
          <span className="inline-flex h-5 items-center rounded-full bg-raised px-2 text-[11px] font-medium text-ink-2">Your plan</span>
        )}
      </div>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[40px] leading-none font-semibold tracking-heading text-ink tabular">{info.price}</span>
        <span className="text-sm text-ink-3">{info.per}</span>
      </p>
      <p className="mt-3 text-sm text-ink-2">{info.summary}</p>
      <ul className="mt-5 flex flex-1 flex-col gap-2.5 text-sm text-ink">
        {info.features.map((feature, index) => (
          <li key={feature} className={`flex items-start gap-2.5 ${strong && index === 0 ? "font-medium" : ""}`}>
            <Tick strong={strong} />
            {feature}
          </li>
        ))}
      </ul>
    </>
  );
}

export function PricingView({ plan, paymentReady, checkout, defaultConfirming = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"upgrade" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState("");
  const [confirming, setConfirming] = useState(defaultConfirming);
  const [gaveUp, setGaveUp] = useState(false);
  const note = checkoutNote(checkout, plan, gaveUp);
  const [free, pro] = PLANS;

  // Back from paying but still Free: Stripe's message is on its way. Look again a few times.
  const waiting = checkout === "success" && plan === "free";
  useEffect(() => {
    if (!waiting) return;
    let count = 0;
    const id = window.setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= RECHECKS) {
        window.clearInterval(id);
        setGaveUp(true);
      }
    }, RECHECK_MS);
    return () => window.clearInterval(id);
  }, [waiting, router]);

  async function upgrade() {
    setBusy("upgrade");
    setError("");
    const answer = await postJson("/api/billing/checkout", {});
    const url = (answer.data as { url?: unknown } | undefined)?.url;
    if (answer.ok && typeof url === "string" && url.startsWith("https://")) {
      // Stripe's own page; card details never touch our site.
      window.location.assign(url);
      return;
    }
    setBusy(null);
    setError(answer.message || MESSAGES.paymentUnavailable);
  }

  async function cancel() {
    setBusy("cancel");
    setError("");
    const answer = await postJson("/api/billing/cancel", {});
    setBusy(null);
    setConfirming(false);
    if (answer.ok) setCancelled(answer.message);
    else setError(answer.message);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 md:px-8 md:py-12">
      <header className="text-center">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-heading text-ink md:text-[32px] md:leading-[38px]">Simple pricing</h1>
        <p className="mt-2 text-sm text-ink-2">Start free. Upgrade when you want a coach that plans your days with you.</p>
      </header>

      {note?.tone === "success" && <FormMessage tone="success" text={note.text} />}
      {note?.tone === "info" && (
        <p role="status" className="rounded-xl border border-line-subtle bg-surface px-3 py-2 text-center text-sm text-ink-2">
          {note.text}
        </p>
      )}
      {error && <FormMessage tone="error" text={error} />}
      {cancelled && <FormMessage tone="success" text={`${cancelled}. You keep the coach until then.`} />}

      <div className="mt-2 grid items-stretch gap-4 md:grid-cols-2">
        <section aria-labelledby="plan-free" className="flex flex-col rounded-card border border-line-subtle bg-surface p-6">
          <PlanHead info={free} current={plan === "free"} strong={false} />
          <div className="mt-6">
            <p className="flex h-11 items-center justify-center rounded-full border border-line text-sm font-medium text-ink-2">
              {plan === "free" ? "Your current plan" : "Included in Pro"}
            </p>
          </div>
        </section>

        <section aria-labelledby="plan-pro" className="relative flex flex-col rounded-card border-2 border-ink bg-surface p-6 shadow-float">
          <span className="absolute -top-3 left-1/2 inline-flex h-6 -translate-x-1/2 items-center gap-1 rounded-full bg-ink px-2.5 text-[11px] font-semibold text-white">
            <Sparkles className="size-3" aria-hidden="true" />
            Most popular
          </span>
          <PlanHead info={pro} current={plan === "pro"} strong />
          <div className="mt-6">
            {plan === "free" && (
              <>
                <Button size="lg" className="w-full" disabled={!paymentReady || busy !== null} onClick={upgrade}>
                  {busy === "upgrade" ? "Opening Stripe…" : "Upgrade to Pro"}
                </Button>
                <p className="mt-2 text-center text-xs text-ink-3">
                  {paymentReady ? "Recurring billing · Cancel anytime" : MESSAGES.paymentUnavailable}
                </p>
              </>
            )}
            {plan === "pro" && !cancelled && !confirming && (
              <Button variant="secondary" size="lg" className="w-full" onClick={() => setConfirming(true)}>
                Cancel Pro
              </Button>
            )}
            {plan === "pro" && confirming && (
              <div role="group" aria-label="Cancel Pro?" className="flex flex-col gap-2">
                <p className="text-sm text-ink-2">Cancel Pro? You keep the coach until the end of the month you paid for.</p>
                <div className="flex gap-2">
                  <Button variant="danger" className="flex-1" disabled={busy !== null} onClick={cancel}>
                    {busy === "cancel" ? "Cancelling…" : "Cancel Pro"}
                  </Button>
                  <Button variant="secondary" className="flex-1" disabled={busy !== null} onClick={() => setConfirming(false)}>
                    Keep Pro
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <p className="flex items-center justify-center gap-2 rounded-xl border border-line-subtle bg-surface px-4 py-3 text-center text-sm text-ink-2">
        <FlaskConical className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
        <span>
          <strong className="font-semibold text-ink">Testing in sandbox?</strong> Use Stripe&apos;s test card{" "}
          <span className="tabular whitespace-nowrap font-medium text-ink">4242 4242 4242 4242</span>, any future date, any CVC.
        </span>
      </p>
    </div>
  );
}
