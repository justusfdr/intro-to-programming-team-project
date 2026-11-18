# Spec 01: Accounts
Build step 1, part 1 of 2. Plan: `docs/ontology.md`. Branch: `01-accounts`.

## Why
A user creates an account, confirms the email address and signs in. Each user's data is protected from the start, so later features build on safe ground.

## What
- [ ] `sign_up` with a new email and an 8-character password creates an `unconfirmed` account (plan `free`, `time_zone` from the browser, else "Europe/Lisbon") and sends a confirmation link.
- [ ] `sign_up` rejects a registered email ("This email is already registered") and a 7-character password ("Password needs at least 8 characters"); nothing is created.
- [ ] `confirm_email` makes the account `confirmed`; a used or expired link: "This link has expired. Ask for a new one".
- [ ] `sign_in` with a wrong password: "Email or password is wrong"; before confirming: "Confirm your email first. Open the link from your sign-up email or ask for a new one". `sign_out` ends the session.
- [ ] `resend_confirmation` shows "If this email needs confirming, we sent a link"; again within 60 seconds: "Please wait a minute before asking again".
- [ ] `request_password_reset` always shows "If this email is registered, we sent a link"; unknown emails get none (A14).
- [ ] `reset_password` with a 7-character password: "Password needs at least 8 characters"; a used link: "This link has expired. Ask for a new one".
- [ ] Not signed in: sign-in page or "401", no data (R3).
- [ ] A user cannot change their own `plan`, even directly in the database (R6).
- [ ] No secret in the repository; `.env.local` git-ignored; `.env.example` lists names only.
- [ ] Row-level security is on for every table, and every check holds on direct calls too (R5).

## Out of scope
- Events and everything in later build steps.
- Creating the Supabase project, entering the secrets and setting up the e-mail sender: a team member's job, not the agent's.

## Done when
All tests pass (on a local or temporary database, with fake e-mails); output pasted in the pull request. Deployed at a public URL; two confirmed accounts checked there. `README.md` and `AGENTS.md` name the run and test commands. Reviewed by another member.
