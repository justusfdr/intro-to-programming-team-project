// The two plans as the pricing page shows them (ontology: "Free has everything except the AI chat;
// Pro adds it"; the price from section 9, approved on 13 Nov 2026). Shared by the page and its tests.

export type Plan = "free" | "pro";

/** €4.99 per month, in cents, as Stripe counts it. The real price lives in Stripe (STRIPE_PRICE_ID). */
export const PRO_PRICE_CENTS = 499;

export type PlanInfo = { id: Plan; name: string; price: string; per: string; summary: string; features: readonly string[] };

export const PLANS: readonly PlanInfo[] = [
  {
    id: "free",
    name: "Free",
    price: "€0",
    per: "per month",
    summary: "Everything you need to plan your weeks and stay focused.",
    features: ["Calendar with goals and to-dos", "Focus sessions with the site blocker", "Analytics of your weeks", "Outlook calendar"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "€4.99",
    per: "per month",
    summary: "Everything in Free, plus a personalized coach that plans with you.",
    features: [
      "Everything in Free",
      "The AI coach, personalized to your goals and your calendar",
      "Say or type your day and get a plan with times",
      "It moves events and adds to-dos when you ask",
      "Undo any accepted plan with one click",
    ],
  },
];

/** What the page says after Stripe sends the browser back. Only a note: the plan changes on Stripe's signed message. */
export function checkoutNote(
  checkout: string | undefined,
  plan: Plan,
  /** The page looked again several times and the plan is still Free. */
  gaveUp = false,
): { tone: "success" | "info"; text: string } | null {
  if (checkout === "success") {
    return plan === "pro"
      ? { tone: "success", text: "Welcome to Pro. The coach is ready for you." }
      : {
          tone: "info",
          text: gaveUp
            ? "Still waiting for the payment confirmation. Reload this page in a minute."
            : "If you just paid, Pro turns on within a few seconds.",
        };
  }
  if (checkout === "cancelled") return { tone: "info", text: "Payment cancelled. Nothing was charged." };
  return null;
}
