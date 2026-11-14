// Tests for supabase/migrations/*_billing.sql and the billing store (spec 24, R6): the customer id is
// read by its user only and written only by the server for Stripe's messages; one customer, one user.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createBillingStore, type BillingStore } from "@/lib/server/db/billing";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let store: BillingStore;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
  store = createBillingStore(db.driver);
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.admin("delete from auth.users");
  alice = await db.createUser("alice@example.com", { confirmed: true });
  bob = await db.createUser("bob@example.com", { confirmed: true });
});

const profile = async (id: string) =>
  (await db.admin<{ plan: string; stripe_customer_id: string | null }>("select plan, stripe_customer_id from app.profiles where id = $1", [id]))[0];

describe("the user cannot write the plan or the customer (R6)", () => {
  it("rejects a direct update of the own customer id and of the plan together with it", async () => {
    await expect(db.withUser(alice, (q) => q("update app.profiles set stripe_customer_id = 'cus_Mine1'"))).rejects.toThrow(/permission denied/);
    await expect(db.withUser(alice, (q) => q("update app.profiles set plan = 'pro', stripe_customer_id = 'cus_Mine1'"))).rejects.toThrow(
      /permission denied/,
    );
    expect(await profile(alice)).toEqual({ plan: "free", stripe_customer_id: null });
  });

  it("lets the user read only their own customer id", async () => {
    await db.admin("update app.profiles set stripe_customer_id = 'cus_Bob1' where id = $1", [bob]);
    expect(await db.withUser(alice, (q) => q("select id, stripe_customer_id from app.profiles"))).toEqual([{ id: alice, stripe_customer_id: null }]);
  });
});

describe("checks the database enforces itself", () => {
  it("refuses one customer for two users", async () => {
    await db.admin("update app.profiles set stripe_customer_id = 'cus_Same1' where id = $1", [alice]);
    await expect(db.admin("update app.profiles set stripe_customer_id = 'cus_Same1' where id = $1", [bob])).rejects.toThrow(
      /profiles_stripe_customer_unique/,
    );
  });

  it.each(["", "cus_", "sub_123", "cus_has space", "cus_ü1", `cus_${"a".repeat(251)}`])("refuses the customer id %j", async (bad) => {
    await expect(db.admin("update app.profiles set stripe_customer_id = $2 where id = $1", [alice, bad])).rejects.toThrow(
      /profiles_stripe_customer_form/,
    );
  });
});

describe("the billing store", () => {
  it("sets the plan of the named user and saves the customer", async () => {
    expect(await store.applyPlan({ userId: alice, customerId: "cus_Alice1", plan: "pro" })).toBe(alice);
    expect(await profile(alice)).toEqual({ plan: "pro", stripe_customer_id: "cus_Alice1" });
    expect(await profile(bob)).toEqual({ plan: "free", stripe_customer_id: null });
  });

  it("finds the user by the saved customer first, and keeps the customer when the message has none", async () => {
    await store.applyPlan({ userId: alice, customerId: "cus_Alice1", plan: "pro" });
    expect(await store.applyPlan({ userId: bob, customerId: "cus_Alice1", plan: "free" })).toBe(alice);
    expect(await profile(alice)).toEqual({ plan: "free", stripe_customer_id: "cus_Alice1" });
    expect(await store.applyPlan({ userId: alice, customerId: null, plan: "pro" })).toBe(alice);
    expect(await profile(alice)).toEqual({ plan: "pro", stripe_customer_id: "cus_Alice1" });
    expect(await profile(bob)).toEqual({ plan: "free", stripe_customer_id: null });
  });

  it("changes nothing and answers null for an unknown or malformed user or customer", async () => {
    const before = await db.admin("select * from app.profiles order by id");
    expect(await store.applyPlan({ userId: null, customerId: null, plan: "pro" })).toBeNull();
    expect(await store.applyPlan({ userId: "not-a-uuid", customerId: "sub_1", plan: "pro" })).toBeNull();
    expect(await store.applyPlan({ userId: "22222222-2222-4222-8222-222222222222", customerId: null, plan: "pro" })).toBeNull();
    expect(await store.applyPlan({ userId: null, customerId: "cus_Nobody1", plan: "pro" })).toBeNull();
    expect(await db.admin("select * from app.profiles order by id")).toEqual(before);
  });

  it("refuses a plan other than free or pro", async () => {
    await expect(store.applyPlan({ userId: alice, customerId: null, plan: "gold" as "pro" })).rejects.toThrow(/free or pro/);
    expect((await profile(alice)).plan).toBe("free");
  });
});
