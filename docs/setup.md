# Setting up Supabase

For the team member who creates the Supabase project. The code and the tests work without it; the app needs it to sign people in.
Keep every key and password in your password manager. Never paste them into the code, a chat or an issue.

## 1. Create the project
1. Sign in at supabase.com and create a new project (free plan, region in the EU, for example Frankfurt).
2. Choose a strong database password and save it in your password manager. You need it in step 6.

## 2. Create the tables
1. Open **SQL Editor** in the project.
2. Run each file in `supabase/migrations/` in name order (oldest first): open the file, copy all of it, paste it into a new query, press **Run**. Each file runs only once.
3. Check under **Table Editor**: choose the schema `app`; it has the tables `profiles`, `settings`, `events`, `goals`, `rules`, `focus_sessions`, `blocked_sites`, `blocked_attempts`, `calendar_connections` and `outlook_deletions`.
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
2. Never use the secret key (`sb_secret_…`) or the old `service_role` key. The app does not need them.
3. On Vercel: **Project > Settings > Environment Variables**, add the same four names. `APP_URL` is the deployed address there, without a slash at the end.

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
10. Focus: start a 15-minute session, pause, resume, end it, and rate it on the Focus page; open an event and choose "Start focus".
11. The blocker: in `extension/config.js` set `APP_URL` to the deployed address, then load the `extension` folder in Chrome (see `extension/README.md`). Sign in to the app in the same Chrome profile; within a minute the Focus page says "Blocker connected". Start a 15-minute session and open youtube.com: Chrome shows the block page.
    - Chrome must allow third-party cookies for the app's address (Chrome settings, Privacy and security, Third-party cookies, "Sites allowed to use third-party cookies"). Otherwise the extension gets "not signed in" and blocks nothing.
    - `EXTENSION_ID` stays empty unless the key in `extension/manifest.json` is replaced.
12. Analytics: after a few sessions (and a blocked visit during one), the Analytics page shows the week's focus time, sessions, score and blocked visits; a day without sessions shows "–".
13. All-day and repeating events: add an all-day "Exam week" from Monday to Friday; it shows in the "All day" row above the hours and cannot be marked done. Add a weekly event on Tuesday and Thursday for four weeks; delete one of its later events with "This and following events": that event and the later ones go, the earlier ones stay.
14. Outlook (after section 9): open the calendar, press **Outlook**, then **Connect Outlook**, sign in at Microsoft and allow access. Back in the calendar it says "Outlook connected." and your Outlook events appear with an arrow-into-tray mark. Add an event in the app: it appears in Outlook within a few seconds. Rename an event in Outlook, reload the calendar after 5 minutes: the new name shows. Press **Outlook** → **Disconnect Outlook**: the Outlook events leave the calendar, and what the app wrote stays in Outlook.

## 9. Register the app at Microsoft (Outlook)
Without this, everything else works; only the **Outlook** button cannot connect.

1. Sign in at **entra.microsoft.com** (Microsoft's portal for app registrations; a personal Microsoft account works) and open **App registrations** → **New registration**.
2. **Name:** Lock In. **Supported account types:** "Accounts in any organizational directory and personal Microsoft accounts".
3. **Redirect URI:** platform **Web**, address `http://localhost:3000/api/outlook/callback`. Press **Register**.
4. Open **Authentication** and add a second Web redirect URI: the deployed address followed by `/api/outlook/callback`, for example `https://your-app.vercel.app/api/outlook/callback`. It must match `APP_URL` exactly. Save.
5. Copy the **Application (client) ID** from **Overview** into `MICROSOFT_CLIENT_ID`.
6. **Certificates & secrets** → **New client secret** (24 months). Copy its **Value** at once (it is shown only once) into `MICROSOFT_CLIENT_SECRET`. Put a reminder in your calendar a month before it expires.
7. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**: tick `Calendars.ReadWrite` and `offline_access`. Nothing else (no mail, no contacts). Remove `User.Read` if it is listed; the app does not need it.
8. Make the encryption key: run `openssl rand -base64 32` in a terminal and put the result into `OUTLOOK_TOKEN_KEY`. Keep it in your password manager. If it changes, every user must connect Outlook again.
9. Put the same three values into Vercel (**Settings → Environment Variables**) and deploy again.
10. Work or school accounts: some organisations only allow apps their IT has approved. Then Microsoft says so on its page, and the app shows "Outlook was not connected". Ask the IT, or use a personal account for the demo.

