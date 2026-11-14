-- Free and Pro, paid through Stripe in test mode (spec 24, ontology R6 and R25). Run once in the
-- Supabase SQL editor after the earlier migrations.
--
-- The profile gets the Stripe customer of the user (ontology section 3: `stripe_customer_id`), so a
-- message from Stripe about a subscription finds its user. Like the plan, it is written only by our
-- server's own database connection, for messages whose Stripe signature it has checked. The role
-- "authenticated" may read its own profile but still never write it (no grant changes here).
alter table app.profiles add column stripe_customer_id text;

-- One customer belongs to one user; Stripe's ids are short ASCII strings starting with "cus_".
alter table app.profiles add constraint profiles_stripe_customer_unique unique (stripe_customer_id);
alter table app.profiles add constraint profiles_stripe_customer_form
  check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]{1,250}$');
