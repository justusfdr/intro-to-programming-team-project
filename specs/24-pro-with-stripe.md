# Spec 24: Free and Pro, paid through Stripe (test mode)
Asked for by the owner on 13 Nov 2026. Plan: `docs/ontology.md` (two plans, `plan`, `stripe_customer_id`, `upgrade_to_pro`, `cancel_pro`, `update_plan`, R5, R6, R21, R25, the Stripe line of the failures table; the price €4.99 per month, approved on 13 Nov 2026). Branch: `24-pro-with-stripe`. Replaces open task A2.

## Why
The coach costs us money for every message. Free keeps everything else; Pro adds the coach for €4.99 a month. We test the whole flow with Stripe's sandbox before any real money is involved.

## What
- [ ] A page `/pricing` in the app's look with two plans: Free (€0: calendar, goals, to-dos, focus sessions, blocker, analytics, Outlook) and Pro (€4.99 per month: everything in Free plus the AI coach). The current plan is marked. While Stripe is in test mode the page shows the test card to use.
- [ ] `upgrade_to_pro` (`POST /api/billing/checkout`): signed in and same origin; plan `free` (else "You already have Pro"); Stripe set up (else "Payment is not available right now."). Creates a Stripe Checkout session for the monthly Pro price (mode `subscription`, our user id as `client_reference_id` and in the subscription's metadata, the saved customer if there is one) and answers its address; the page sends the browser there.
- [ ] The return page (`/pricing?checkout=success`) changes nothing: it only says the payment is being confirmed. The plan changes only on Stripe's signed message (R25).
- [ ] `update_plan` (`POST /api/billing/webhook`, called by Stripe, no session): the signature (`Stripe-Signature`, HMAC-SHA256 with the webhook secret, at most 5 minutes old) must be right, else 400 and nothing changes. A live-mode event is refused (R25). `checkout.session.completed` (paid, subscription) → plan `pro` and `stripe_customer_id` saved. `customer.subscription.updated` → `pro` while the subscription is `active` or `trialing`, `free` when it is `canceled`, `unpaid` or `incomplete_expired`. `customer.subscription.deleted` → `free`. Other events are answered 200 and ignored. The user is found by the saved customer id, else by the id in the event's metadata.
- [ ] `cancel_pro` (`POST /api/billing/cancel`): signed in and same origin; plan `pro` (else "You do not have Pro"); Stripe set up. Sets the active subscription to end after the paid period; the plan stays `pro` until Stripe's `customer.subscription.deleted` arrives. Answers "Pro ends on {date}".
- [ ] R6: the plan and the customer id are written only by the server's own database connection for Stripe's verified messages; the role `authenticated` still cannot write `app.profiles`.
- [ ] R25: a secret key that does not start with `sk_test_` is not used; payment stays off and the error is logged. The secret key and the webhook secret come only from environment variables (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), the price from `STRIPE_PRICE_ID`.
- [ ] Stripe is called from one module (`src/lib/server/stripe/`), with `fetch` and no extra package. Tests use a fake Stripe and never call the real one.
- [ ] The coach: for a Free user with `CHAT_PRO_ONLY=true` the notice links to the pricing page. The "Your account" card in Settings shows the plan with a link to the pricing page (Settings keeps its five cards, spec 12).

## Out of scope
Real payments (live mode), taxes and VAT, invoices in the app, a trial, coupons, yearly prices, changing the card inside the app (Stripe's customer portal), a public pricing page for signed-out visitors.

## Done when
All tests pass on a temporary database with the fake Stripe, existing tests unchanged; `npm run check` passes. In the sandbox: a Free user pays with the test card 4242 4242 4242 4242 and becomes Pro, a declined card (4000 0000 0000 0002) leaves the user Free, cancelling keeps Pro until the period ends, and Stripe's deleted event makes the user Free again. Reviewed by another member; merged only after the owner confirms.
