import "server-only";

// The one place that writes a user's plan (ontology R6: only the server sets `plan`, never the user,
// not even through the database). Stripe's messages arrive without a signed-in user, so this does not
// run as "authenticated" like withUser: it runs as the server's own database role, which owns the
// tables. It offers exactly one fixed statement and nothing that gives raw access. Call it only for a
// message whose Stripe signature was checked (src/lib/server/actions/billing.ts).
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
   * the customer on them. The user's id, or null when no user matches (nothing changed then).
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
        const rows = await run(
          `update app.profiles
              set plan = $3, stripe_customer_id = coalesce($2, stripe_customer_id)
            where id = coalesce((select id from app.profiles where stripe_customer_id = $2), $1::uuid)
          returning id`,
          [user, customer, plan],
        );
        return (rows[0]?.id as string | undefined) ?? null;
      });
    },
  };
}
