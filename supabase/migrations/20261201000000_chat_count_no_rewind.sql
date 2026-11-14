-- The coach's day counter can no longer be reset by changing the time zone (changed on 14 November 2026).
-- Run once in the Supabase SQL editor after 20261130000000_event_travel_mode.sql.
--
-- Before, the count started again whenever "today" in the user's time zone differed from the stored day.
-- The time zone is the user's own setting, so switching between a zone far east (UTC+14) and one far west
-- (UTC-12) moved "today" back and forth and gave 20 new messages each time. Now the count starts again
-- only when today is LATER than the stored day. If today is the same day or an earlier one (the zone was
-- moved back), the message counts against the stored day, which stays as it is.
--
-- Replaces the function with the same name, arguments, return value and rights: the main branch runs
-- against the same database and keeps working unchanged.

create or replace function app.chat_count_message()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date;
  counted integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select (pg_catalog.now() at time zone s.time_zone)::date into today from app.settings s where s.user_id = uid;
  if today is null then raise exception 'no settings' using errcode = '42501'; end if;

  -- One statement, so the row lock keeps two calls at the same moment from both getting the 20th message.
  update app.profiles
     set chat_count = case when chat_count_date is null or today > chat_count_date then 1 else chat_count + 1 end,
         chat_count_date = case when chat_count_date is null or today > chat_count_date then today else chat_count_date end
   where id = uid
     and (chat_count_date is null or today > chat_count_date or chat_count < 20)
  returning chat_count into counted;

  return counted is not null;
end;
$$;

revoke all on function app.chat_count_message() from public, anon;
grant execute on function app.chat_count_message() to authenticated;
