# Spec 50: Security fixes from the review of 18 Nov 2026

Asked for by the owner on 18 Nov 2026 after a security review of `main`; the team confirms with the merge.

## Why
The grading criterion "Security" asks for access control, input checks and dependencies without known
vulnerabilities. The review found three small things to fix:
1. The development tools had known vulnerabilities (`npm audit`: 17).
2. Signing up with an address that already has an account answered "This email is already registered", so
   anybody could find out who has an account. Password reset and resending the link already answer neutrally.
3. The sign-in limit counted every attempt per e-mail address, from any client. A stranger could type 10
   wrong passwords for someone else's address and lock them out for 15 minutes.

## What
- [x] `npm audit fix`: the dependency tree is updated without changing `package.json`. What is left is one
  advisory with no fixed version yet (picomatch, GHSA-fc5q-39xc-vjpf, a slow-pattern bug in file matching);
  it is only in development tools (ESLint, Vitest), never in the deployed app (`npm audit --omit=dev`: 0).
- [x] `sign_up` with an address that is already registered answers exactly like a new address (201, "We sent
  you a link. Open it to confirm your email."). Nothing is created, no mail is sent, the old password stays.
  Ontology `sign_up` changed accordingly.
- [x] `sign_in` counts only wrong passwords: at most 10 per address from one client and 50 per address from
  all clients together, per 15 minutes. A successful sign-in and an unconfirmed account with the right
  password do not count. The limit of 30 account actions per client stays.

## Out of scope
- Who can see whom through event invitations (invitations get reworked later).
- A shared store for the limits (they stay in each server instance's memory, as before).
- A daily limit for the coach.

## Done when
- The tests above pass, and `npm run check` passes.
- Changed tests, for the reviewer to read: `sign-up.test.ts` (the registered address now gets 201) and
  `account-limits.test.ts` (the sign-in block, now about wrong passwords only).
