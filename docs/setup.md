# Setting up Supabase

For the team member who creates the Supabase project. The code and the tests work without it; the app needs it to sign people in.
Keep every key and password in your password manager. Never paste them into the code, a chat or an issue.

## 1. Create the project
1. Sign in at supabase.com and create a new project (free plan, region in the EU, for example Frankfurt).
2. Choose a strong database password and save it in your password manager. You need it in step 6.

## 2. Create the tables
1. Open **SQL Editor** in the project.
2. Run each file in `supabase/migrations/` in name order (oldest first): open the file, copy all of it, paste it into a new query, press **Run**. Each file runs only once.
3. Check under **Table Editor**: choose the schema `app`; it has the tables `profiles` and `settings`.
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
