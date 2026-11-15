# Closed: the schema tests of the shared lists

The shared to-do lists of spec 30 were withdrawn in spec 34. Their tables and functions stay in the
database, but `supabase/migrations/20261209000000_lists_closed.sql` takes away every right a user had on
them, so these two files (unchanged since spec 30 and the sharing hardening) would now fail where they
call the list functions as a user. `vitest.config.mts` leaves this folder out of `npm test`; the parts
of the hardening tests that do not need the lists run on in `test/db/sharing-hardening-kept-schema.test.ts`,
and `test/db/lists-closed-schema.test.ts` proves the lists are closed.

To bring them back with the lists: add a migration that grants the rights again, then move both files
back to `test/db/` (their paths to `harness.ts`, the shim and the migrations are written for that folder)
and delete this folder.
