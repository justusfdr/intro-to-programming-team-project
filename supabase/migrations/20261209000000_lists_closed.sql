-- Shared to-do lists closed (spec 34, branch 35-no-lists). Run once in the Supabase SQL editor after the
-- earlier files (it needs 20261205000000_shared_lists.sql and 20261206000000_sharing_hardening.sql).
--
-- The owner withdrew the shared lists of spec 30: a team task tool does not fit a calendar for focusing.
-- They were never merged to main and no user has a list. The app no longer has any screen, route or
-- action for them.
--
-- Nothing is dropped: the shared database has the tables and functions, and the migration history must
-- stay true. This file only takes away every right a signed-in user had on them, so they are empty and
-- unreachable:
-- - no user may call any list function any more (they all check the caller, but now nobody gets that far);
-- - no user may read the three list tables (their row-level security stays on as well).
-- app.list_text_valid stays callable: the profile's bio uses the same text rule (spec 31).
-- app.may_see_profile keeps its definition: its condition "shares a list" can never be true without rows.
--
-- The file runs as one transaction (begin ... commit) so that it is all or nothing in any SQL editor.

begin;

revoke all on function app.create_list(text) from public, anon, authenticated;
revoke all on function app.rename_list(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function app.delete_list(uuid) from public, anon, authenticated;
revoke all on function app.add_list_member(uuid, uuid) from public, anon, authenticated;
revoke all on function app.remove_list_member(uuid, uuid) from public, anon, authenticated;
revoke all on function app.leave_list(uuid) from public, anon, authenticated;
revoke all on function app.add_list_item(uuid, text) from public, anon, authenticated;
revoke all on function app.rename_list_item(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function app.tick_list_item(uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function app.move_list_item(uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function app.delete_list_item(uuid, timestamptz) from public, anon, authenticated;
revoke all on function app.list_people(uuid) from public, anon, authenticated;
revoke all on function app.can_use_list(uuid) from public, anon, authenticated;

-- The table rights, and the column right on the member list, which a table-wide revoke also takes back;
-- it is named here so the file says what it does.
revoke all on app.lists, app.list_members, app.list_items from public, anon, authenticated;
revoke select (id, list_id, user_id, added_at) on app.list_members from authenticated;

commit;
