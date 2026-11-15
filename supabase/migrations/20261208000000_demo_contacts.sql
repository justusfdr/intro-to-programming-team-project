-- Demo contacts (spec 32, branch 33-demo-contacts). Run once in the Supabase SQL editor after the
-- earlier files (it needs 20261111000000_accounts.sql).
--
-- Additive only: the code on main and on the sharing branches runs against the same database and must
-- keep working unchanged. One new column on app.profiles with a default, and one new function. Nothing
-- existing is removed, renamed, replaced, made stricter or loosened.
--
-- The demo contacts themselves (three made-up people, their calendars and focus charts) live in the
-- app's code (src/lib/demo/people.ts), never in the database: they have no account, no row in
-- auth.users, app.contacts, app.shares or any other table of real people, and no database function
-- ever returns them. The database keeps only the user's own choice: whether they want to see them.
--
-- The select policy on app.profiles stays "own row only", so a user reads only their own choice, and
-- there is still no write right on app.profiles for the user (R6): the column is written only through
-- app.set_demo_contacts, in the style of app.set_display_name.
--
-- The file runs as one transaction (begin ... commit) so that it is all or nothing in any SQL editor.

begin;

alter table app.profiles add column demo_contacts boolean not null default false;

-- Switches the signed-in user's demo contacts on or off, on their own row only. Null is refused (R1).
create function app.set_demo_contacts(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_on is null then raise exception 'Invalid request.' using errcode = '22023'; end if;
  update app.profiles set demo_contacts = p_on where id = uid;
end;
$$;

revoke all on function app.set_demo_contacts(boolean) from public, anon;
grant execute on function app.set_demo_contacts(boolean) to authenticated;

commit;
