"use client";

// The pricing page (spec 24): Free and Pro side by side, the current plan marked. "Upgrade to Pro"
// asks our server for Stripe's checkout page and goes there; "Cancel Pro" lets the subscription end
// after the paid period. The page never changes the plan itself: after paying it only waits for
// Stripe's signed message to reach our server (R25), and looks again every two seconds for a while.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, FlaskConical, Sparkles } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { checkoutNote, PLANS, type Plan } from "@/lib/billing/plans";
import { postJson } from "@/lib/client/post-json";
import { MESSAGES } from "@/lib/messages";

/** How often and how long the page looks again for the plan after paying. */
const RECHECK_MS = 2000;
const RECHECKS = 15;

type Props = {
  plan: Plan;
  paymentReady: boolean;
  /** "success" or "cancelled" when Stripe sent the browser back. */
  checkout?: string;
  /** Starts at the "Cancel Pro?" question (static previews only). */
  defaultConfirming?: boolean;
};

export function PricingView({ plan, paymentReady, checkout, defaultConfirming = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"upgrade" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState("");
  const [confirming, setConfirming] = useState(defaultConfirming);
  const note = checkoutNote(checkout, plan);

  // Back from paying but still Free: Stripe's message is on its way. Look again a few times.
  const waiting = checkout === "success" && plan === "free";
  useEffect(() => {
    if (!waiting) return;
    let count = 0;
    const id = window.setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= RECHECKS) window.clearInterval(id);
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
      <PageHeader title="Plans" subtitle="Free has everything to plan and focus. Pro adds the coach." />

      <p className="flex items-start gap-2 rounded-xl border border-line-subtle bg-raised px-3 py-2.5 text-sm text-ink-2">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
        <span>
          <strong className="font-semibold text-ink">Test mode.</strong> No real money moves. Pay with the card{" "}
          <span className="tabular whitespace-nowrap font-medium text-ink">4242 4242 4242 4242</span>, any future date and any
          three digits.
        </span>
      </p>

      {note?.tone === "success" && <FormMessage tone="success" text={note.text} />}
      {note?.tone === "info" && (
        <p role="status" className="rounded-xl border border-line-subtle bg-surface px-3 py-2 text-sm text-ink-2">
          {note.text}
        </p>
      )}
      {error && <FormMessage tone="error" text={error} />}
      {cancelled && <FormMessage tone="success" text={`${cancelled}. You keep the coach until then.`} />}

      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((p) => {
          const current = p.id === plan;
          const pro = p.id === "pro";
          return (
            <Card
              key={p.id}
              aria-labelledby={`plan-${p.id}`}
              className={`flex flex-col p-5 ${pro ? "border-ink/80 shadow-sm" : ""}`}
              role="region"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 id={`plan-${p.id}`} className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                  {pro && <Sparkles className="size-4" aria-hidden="true" />}
                  {p.name}
                </h2>
                {current && (
                  <span className="inline-flex h-5 items-center rounded-full bg-success-soft px-2 text-[11px] font-medium text-success">
                    Your plan
                  </span>
                )}
              </div>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[32px] leading-none font-semibold tracking-heading text-ink tabular">{p.price}</span>
                <span className="text-sm text-ink-2">{p.per}</span>
              </p>
              <p className="mt-2 text-sm text-ink-2">{p.summary}</p>
              <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-ink">
                {p.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {pro && plan === "free" && (
                  <Button size="lg" className="w-full" disabled={!paymentReady || busy !== null} onClick={upgrade}>
                    {busy === "upgrade" ? "Opening Stripe…" : "Upgrade to Pro"}
                  </Button>
                )}
                {pro && plan === "free" && !paymentReady && <p className="mt-2 text-xs text-ink-3">{MESSAGES.paymentUnavailable}</p>}
                {pro && plan === "pro" && !cancelled && !confirming && (
                  <Button variant="secondary" size="lg" className="w-full" onClick={() => setConfirming(true)}>
                    Cancel Pro
                  </Button>
                )}
                {pro && plan === "pro" && confirming && (
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
            </Card>
          );
        })}
      </div>
    </div>
  );
}
