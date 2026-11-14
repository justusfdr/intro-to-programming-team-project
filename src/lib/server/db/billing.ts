import "server-only";

// The one place that writes a user's plan (ontology R6: only the server sets `plan`, never the user,
// not even through the database). Stripe's messages arrive without a signed-in user, so this does not
// run as "authenticated" like withUser: it runs as the server's own database role, which owns the
// tables. It offers exactly one operation, made of fixed statements, and nothing that gives raw access.
// Call it only for a message whose Stripe signature was checked (src/lib/server/actions/billing.ts).
import type { Driver } from "./with-user";

export type Plan = "free" | "pro";

export type PlanChange = {
  /** The user named in the message (client_reference_id or metadata), if any. */
  userId: string | null;
  /** The Stripe customer in the message, if any; saved on the user. */
  customerId: string | null;
  plan: Plan;
};

export interface BillingStore {
  /**
   * Sets the plan of the user who has this customer, else of the user named in the message, and saves
   * the customer on them. The user's id, or null when no user matches (nothing changed then). A named
   * user who already has another customer is not changed either (Issue #42).
   */
  applyPlan(change: PlanChange): Promise<string | null>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOMER = /^cus_[A-Za-z0-9]{1,250}$/;

export function createBillingStore(driver: Driver): BillingStore {
  return {
    async applyPlan({ userId, customerId, plan }) {
      const user = userId !== null && UUID.test(userId) ? userId : null;
      const customer = customerId !== null && CUSTOMER.test(customerId) ? customerId : null;
      if (user === null && customer === null) return null;
      if (plan !== "free" && plan !== "pro") throw new Error("applyPlan needs the plan free or pro.");
      return driver.transaction(async (run) => {
        // The user who has this customer comes first; otherwise the user named in the message.
        const [owner] = customer === null ? [] : await run("select id from app.profiles where stripe_customer_id = $1", [customer]);
        const target = (owner?.id as string | undefined) ?? user;
        if (target === null) return null;
        if (!owner && customer !== null) {
          // Issue #42: a message for another customer than the one saved on the named user changes
          // nothing. Saving it would silently replace the customer whose subscription "Cancel Pro" stops,
          // and an "ended" message for that other customer would wrongly make the user Free. Checkout now
          // always uses the saved customer, so this only happens for a customer made outside the app.
          const [named] = await run("select stripe_customer_id from app.profiles where id = $1 for update", [target]);
          const saved = named?.stripe_customer_id as string | null | undefined;
          if (saved && saved !== customer) {
            console.error("Stripe message refused: it names a user who already has another Stripe customer.");
            return null;
          }
        }
        const rows = await run(
          `update app.profiles
              set plan = $2, stripe_customer_id = coalesce($3, stripe_customer_id)
            where id = $1::uuid
          returning id`,
          [target, plan, customer],
        );
        return (rows[0]?.id as string | undefined) ?? null;
      });
    },
  };
}
