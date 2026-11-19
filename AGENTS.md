# Rules for coding agents

## Before you start
- Read `docs/ontology.md` first. Features are built from it, never the other way round.
- Never change `docs/ontology.md` without the team's approval. If a concept, action or rule is missing, propose the change and wait.
- Work on one spec at a time, on a branch named after the spec.

## While you work
- Run the tests after every change and paste the output in your report.
- Commit in small steps: one commit per finished step (for example the rule, then its test, then the screen), each with the tests passing and a message that says what changed. Never collect a whole feature in one commit.
- Commit as the person you work for, with their own Git name and e-mail, so GitHub shows who did the work.
- Never edit, delete or skip a test.
- Secrets come only from environment variables. Never write a key in the code. The secrets file (`.env.local`) is never committed; `.env.example` holds names and placeholders only.
- Calls to each external service (database, Claude, Outlook, routing, Stripe) live in one module per service.
- Tests use fake responses and a local or temporary database. They never call the real services.
- Check permissions on the server, where the action happens, not only on the screen.
- A rejected action changes nothing (ontology R1). Every rule gets a test for the accepted and for the rejected case.
- Keep dependencies few, pin exact versions, and run the dependency audit before a merge.

## Pull requests and reviews
- Every change reaches `main` only through a pull request. Never push to `main` directly.
- Never merge a pull request that has no approving review from a team member other than its author. If it has none, say so and stop; do not merge, and do not approve it yourself.
- Fill in the pull request template: what changes, how it was checked, what was not checked.

## Stack and commands
- Next.js with TypeScript, Supabase, Chrome extension in JavaScript. See `README.md`.
- Run the app: `npm run dev` (needs `.env.local`, see `docs/setup.md`)
- Run the tests: `npm test`; all checks: `npm run check`

## Style
- Write code comments, messages and reports in plain human language.
