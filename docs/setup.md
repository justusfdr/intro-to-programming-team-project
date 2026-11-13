# Setting up Supabase

For the team member who creates the Supabase project. The code and the tests work without it; the app needs it to sign people in.
Keep every key and password in your password manager. Never paste them into the code, a chat or an issue.

## 1. Create the project
1. Sign in at supabase.com and create a new project (free plan, region in the EU, for example Frankfurt).
2. Choose a strong database password and save it in your password manager. You need it in step 6.

## 2. Create the tables
1. Open **SQL Editor** in the project.
2. Run each file in `supabase/migrations/` in name order (oldest first): open the file, copy all of it, paste it into a new query, press **Run**. Each file runs only once.
3. Check under **Table Editor**: choose the schema `app`; it has the tables `profiles`, `settings`, `events`, `goals`, `rules`, `focus_sessions`, `blocked_sites`, `blocked_attempts`, `calendar_connections`, `outlook_deletions`, `tasks`, `chat_messages` and `draft_plans`.
4. Open **Project Settings > Data API**. Under **Exposed schemas**, `app` must **not** be listed. Do not add it. (Our server is the only way to our tables.)

## 3. Switch on e-mail confirmation
1. Open **Authentication > Sign In / Providers > Email**.
2. **Enable email provider:** on. **Confirm email:** on.
3. **Secure password change:** off (our reset flow sets the new password right after the link).
4. **Minimum password length:** 8.
5. Save.

## 4. Set the addresses
1. Open **Authentication > URL Configuration**.
2. **Site URL:** the deployed address, for example `https://your-app.vercel.app`. While you only work locally, use `http://localhost:3000`.
3. **Redirect URLs:** add `http://localhost:3000/**` and the deployed address followed by `/**`.

## 5. Change the e-mail templates
Our server checks the links itself, so the e-mails must point to our page `/auth/confirm`.
1. Open **Authentication > Emails > Templates**.
2. **Confirm signup:** replace the link in the message with
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
3. **Reset password:** replace the link with
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
4. Save each template.

## 6. Copy the keys into the environment variables
The names are listed in `.env.example`.
1. Locally: copy `.env.example` to `.env.local` (git ignores it) and fill in:
   - `SUPABASE_URL`: **Project Settings > API**, "Project URL".
   - `SUPABASE_PUBLISHABLE_KEY`: **Project Settings > API Keys**, the publishable key (`sb_publishable_…`).
   - `DATABASE_URL`: **Connect** (top of the dashboard) **> Transaction pooler** (port 6543). Replace `[YOUR-PASSWORD]` with the database password from step 1.
   - `APP_URL`: `http://localhost:3000`.
   - `DATABASE_CA_CERT` (optional, recommended): the database's certificate. In the dashboard open
     **Project Settings > Database**, section **SSL configuration**, and click **Download certificate**. Put the
     whole file content in the variable (on one line, write `\n` for each line break). With it the app checks
     that it really talks to your database (certificate and host name); without it the connection is still
     encrypted, but not checked, and the server log says so once at start.
   - In the same section switch on **Enforce SSL on incoming connections**, so the database itself refuses
     unencrypted connections. The app always encrypts (except for a database on `localhost`), whatever the
     connection string says.
2. Never use the secret key (`sb_secret_…`) or the old `service_role` key. The app does not need them.
3. On Vercel: **Project > Settings > Environment Variables**, add the same names (`DATABASE_CA_CERT` too, if you use it). `APP_URL` is the deployed address there, without a slash at the end.

## 7. Confirm a test account by hand
The built-in e-mail sender allows only **2 e-mails per hour** for the whole project. To confirm a test account without an e-mail:
1. Sign up in the app.
2. In the **SQL Editor** run (with the test address):
   `update auth.users set email_confirmed_at = now() where email = 'test@example.com';`
3. Sign in in the app.

Before step 1 is deployed we switch to our own e-mail sender (ontology, section 9): **Authentication > Emails > SMTP Settings**. Its password is a secret, kept only in Supabase.

## 8. Check Supabase's behaviour once
Our code relies on these answers from Supabase. Check them once with two test addresses and tell the team if one differs:
1. Sign up with an address that is already **confirmed**: the app shows "This email is already registered".
2. Sign in with an **unconfirmed** account and the right password: "Confirm your email first. We sent you a link".
3. Ask for a second confirmation link within 60 seconds: "Please wait a minute before asking again".
4. Open a confirmation link twice: the second time shows "This link has expired. Ask for a new one".
5. Walk through both paths once: `/sign-up` → e-mail → "Confirm my email" → signed in on `/`; `/forgot-password` → e-mail → "Set a new password" → new password (within 15 minutes) → `/sign-in`.
6. A session from a reset link carries the method `recovery` with a timestamp in its `amr` claim: open a reset link, then set a new password; it must work. (If it says "This link has expired", the claim is missing and setting passwords is blocked; tell the team.)
7. The week page (`/`), signed in with a confirmed account: add "Statistics revision" today 09:00 to 11:00; edit it; mark it done (only possible once it has started); delete it. Then open the same account in a second browser, change an event in one and save an old version of it in the other: the second save must say "Changed on another device. Reload to see the latest version".
8. With two confirmed accounts, each sees only their own events.
9. Goals: create a goal with two rules, link an event to it, mark the event done once it has started: the goals panel counts it ("This week: 1 of 2 done").
10. Tasks: add a task under a goal with a due date, tick it off, reopen it; then delete the goal: the task is listed under "Inbox". With two confirmed accounts, each sees only their own tasks.
11. Focus: start a 15-minute session, pause, resume, end it, and rate it on the Focus page; open an event and choose "Start focus".
12. The blocker: in `extension/config.js` set `APP_URL` to the deployed address, then load the `extension` folder in Chrome (see `extension/README.md`). Sign in to the app in the same Chrome profile; within a minute the Focus page says "Blocker connected". Start a 15-minute session and open youtube.com: Chrome shows the block page.
    - Chrome must allow third-party cookies for the app's address (Chrome settings, Privacy and security, Third-party cookies, "Sites allowed to use third-party cookies"). Otherwise the extension gets "not signed in" and blocks nothing.
    - `EXTENSION_ID` stays empty unless the key in `extension/manifest.json` is replaced.
13. Analytics: after a few sessions (and a blocked visit during one), the Analytics page shows the week's focus time, sessions, score and blocked visits; a day without sessions shows "–".
14. All-day and repeating events: add an all-day "Exam week" from Monday to Friday; it shows in the "All day" row above the hours and cannot be marked done. Add a weekly event on Tuesday and Thursday for four weeks; delete one of its later events with "This and following events": that event and the later ones go, the earlier ones stay.
15. Outlook (after section 9): open the calendar, press **Outlook**, then **Connect Outlook**, sign in at Microsoft and allow access. Back in the calendar it says "Outlook connected." and your Outlook events appear with an arrow-into-tray mark. Add an event in the app: it appears in Outlook within a few seconds. Rename an event in Outlook, reload the calendar after 5 minutes: the new name shows. Press **Outlook** → **Disconnect Outlook**: the Outlook events leave the calendar, and what the app wrote stays in Outlook.

## 9. Register the app at Microsoft (Outlook)
Without this, everything else works; the **Outlook calendar** card in Settings then says "Outlook is not set up on this server yet".

1. Sign in at **entra.microsoft.com** (Microsoft's portal for app registrations) and open **App registrations** → **New registration**. Since June 2024 Microsoft requires every app registration to live in a directory (a Microsoft Entra tenant). Work and school accounts already have one. A purely personal Microsoft account (Outlook.com, Hotmail) has none: create one first, for example by signing up for the free Microsoft 365 Developer Program or an Azure free account with that personal account, then register the app in the directory it creates. Users with personal accounts can still connect afterwards, because of the account type chosen in step 2.
2. **Name:** LockedIn. **Supported account types:** "Accounts in any organizational directory and personal Microsoft accounts".
3. **Redirect URI:** platform **Web**, address `http://localhost:3000/api/outlook/callback`. Press **Register**.
4. Open **Authentication** and add a second Web redirect URI: the deployed address followed by `/api/outlook/callback`, for example `https://your-app.vercel.app/api/outlook/callback`. It must match `APP_URL` exactly. Save.
5. Copy the **Application (client) ID** from **Overview** into `MICROSOFT_CLIENT_ID`.
6. **Certificates & secrets** → **New client secret** (24 months). Copy its **Value** at once (it is shown only once) into `MICROSOFT_CLIENT_SECRET`. Put a reminder in your calendar a month before it expires.
7. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**: tick `Calendars.ReadWrite` and `offline_access`. Nothing else (no mail, no contacts). Remove `User.Read` if it is listed; the app does not need it.
8. Optional: `MICROSOFT_TENANT`. Leave it unset for the default `common` (personal accounts and any work or school directory). Set it to your directory's tenant id or domain only if sign-ins must stay inside one organisation. (The name is `MICROSOFT_TENANT`, not `MICROSOFT_TENANT_ID`.)
9. Make the encryption key: run `openssl rand -base64 32` in a terminal and put the result into `OUTLOOK_TOKEN_KEY`. Keep it in your password manager. If it changes, every user must connect Outlook again.
10. Put the same three values (and `MICROSOFT_TENANT` if you set it) into Vercel (**Settings → Environment Variables**) and deploy again.
11. Work or school accounts: some organisations only allow apps their IT has approved. Then Microsoft says so on its page, and the app shows "Outlook was not connected". Ask the IT, or use a personal account for the demo.

## 10. The Claude API key (the coach)
Without it, everything else works; the coach then answers every message with "The assistant is not available right now. Your calendar is unchanged", and its page says the coach is not set up on this server.

1. Sign in at **platform.claude.com** (the Claude Console) with the team's account. This is the developer platform and is billed separately: a Claude chat subscription (Pro, Max or Team on claude.ai) does **not** include API use, and its login is not an API key.
2. **Billing:** add credit, then open **Limits** and set a **monthly spending limit** for the workspace (for the course a few euros is plenty). At the limit Claude refuses further calls; the app then shows "not available" and nothing breaks (ontology R21: the provider account has a spending limit).
3. **API Keys** → **Create Key**, name it "LockedIn" (or one key per environment: "LockedIn local", "LockedIn Vercel"). Copy it at once (it is shown only once) into `ANTHROPIC_API_KEY`. It is a secret: password manager, `.env.local` and Vercel only; never in the code, a chat or an issue.
4. Optional: `ANTHROPIC_MODEL`. Leave it unset for the default `claude-opus-5-5`. To save money set `claude-haiku-5-5` (cheaper and faster, plans a little less carefully). Use the exact model name; the app sends refusal fallbacks only to models that take them.
5. Optional: `CHAT_PRO_ONLY`. Leave it unset while Free and Pro are not built: every signed-in user may use the coach. Set it to `true` to allow only Pro users (ontology R21).
6. Put the same values into Vercel (**Settings → Environment Variables**) and deploy again.
7. Try it: open the coach, write "Tomorrow I want to study 4 hours and watch football in the evening" (and once in German); a draft appears; "Add to calendar" puts the events in the calendar. Each user has 20 messages a day.
8. After a leak: delete the key in the Console (**API Keys**), create a new one, put it in both places, and check **Usage** for calls you did not make.

## 11. Stripe in test mode (Pro, €4.99 per month)
Without it, everything else works; the pricing page then says "Payment is not available right now." Test mode only: the server refuses any secret key that does not start with `sk_test_` (ontology R25), so no real money can move.

1. Sign in at **dashboard.stripe.com** and switch to the **sandbox** (test mode). The team's sandbox is "fokus website sandbox".
2. **Product catalog**: the product "LockedIn Pro" with a recurring price of €4.99 per month exists already. Copy the price's id (`price_…`) into `STRIPE_PRICE_ID`. It is not a secret.
3. **Developers → API keys**: copy the **Secret key** (`sk_test_…`) into `STRIPE_SECRET_KEY`. It is a secret: password manager, `.env.local` and Vercel only; never in the code, a chat or an issue.
4. The webhook: Stripe tells our server about payments at `/api/billing/webhook`; the plan changes only then.
   - **On your computer:** install the Stripe CLI (docs.stripe.com/stripe-cli), run `stripe login`, then keep `stripe listen --forward-to localhost:3000/api/billing/webhook` running while you test. It prints a signing secret (`whsec_…`): put it into `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.
   - **On Vercel:** **Developers → Webhooks → Add endpoint**, the address `https://your-app.vercel.app/api/billing/webhook`, the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Copy its signing secret into Vercel's `STRIPE_WEBHOOK_SECRET`.
5. Set `CHAT_PRO_ONLY=true` so only Pro users can use the coach (ontology R21).
6. Try it: as a Free user open **Settings → Your account → See plans**, choose **Upgrade to Pro**, pay with the card `4242 4242 4242 4242`, any future date, any three digits. Back in the app the page becomes Pro within a few seconds, and the coach opens. A declined card is `4000 0000 0000 0002`. **Cancel Pro** keeps Pro until the paid month ends; to end it at once in a test, cancel the subscription in the Dashboard (**Subscriptions**), and the user is Free again.
7. Run the migration `supabase/migrations/20261129000000_billing.sql` once in the SQL editor (it adds the customer id to the profile).
8. After a leak: **Developers → API keys → Roll key**, put the new key in both places.
