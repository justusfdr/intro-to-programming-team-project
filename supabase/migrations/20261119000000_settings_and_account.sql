-- Settings page and deleting an account (spec 12, branch prototype-style). Run once in the Supabase SQL
-- editor after the tasks file.
--
-- Additive only: the main branch runs against the same database. New columns have defaults, nothing
-- existing is removed or made stricter.

-- ---------- Display settings ----------
-- How times look (12-hour as in the first prototype, or 24-hour) and the hours the calendar shows.
alter table app.settings
  add column time_format text not null default '12h',
  add column day_start_hour integer not null default 7,
  add column day_end_hour integer not null default 21;

alter table app.settings
  add constraint settings_time_format check (time_format in ('12h', '24h')),
  add constraint settings_day_start_hour check (day_start_hour between 0 and 23),
  add constraint settings_day_end_hour check (day_end_hour between 1 and 24),
  add constraint settings_day_end_after_start check (day_end_hour > day_start_hour);

-- Users may change the new columns of their own row (row-level security from the accounts file).
grant update (time_format, day_start_hour, day_end_hour) on app.settings to authenticated;

-- ---------- delete_account ----------
-- Deletes the signed-in user's sign-in account; every app row goes with it (on delete cascade).
-- Runs as the owner, because users may never write auth.users; it touches only auth.uid()'s row.
-- A Pro plan must be cancelled first (ontology: "Cancel Pro before deleting your account").
create function app.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if exists (select 1 from app.profiles where id = uid and plan <> 'free') then
    raise exception 'Cancel Pro before deleting your account' using errcode = 'P0001';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function app.delete_account() from public, anon;
grant execute on function app.delete_account() to authenticated;
