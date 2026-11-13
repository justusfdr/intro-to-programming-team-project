-- The coach: the AI chat's messages, its drafts and the daily message counter (spec 19).
-- Run once in the Supabase SQL editor after the event location file.
--
-- Additive only: the main branch runs against the same database. New columns have defaults, nothing
-- existing is removed or made stricter.
--
-- Security model, as everywhere: the browser never talks to the database. Our server runs every query
-- as the role "authenticated" with the signed-in user's id, so row-level security limits it to the
-- user's own rows (R3). What a user must never write themselves (the day counter, an accepted draft and
-- the events it creates with source "assistant") goes through two narrow security definer functions
-- that work on auth.uid()'s rows only.

-- ---------- The day counter (R21) ----------
-- How many messages the user sent on chat_count_date (a day in the user's time zone). Users can read
-- their profile but never write it (no update grant on app.profiles); only app.chat_count_message counts.
alter table app.profiles
  add column chat_count_date date,
  add column chat_count integer not null default 0;

alter table app.profiles
  add constraint profiles_chat_count check (chat_count between 0 and 20);

-- send_message: counts one message for today (the database's clock, in the user's time zone).
-- Returns false, and counts nothing, when today's 20 messages are used. The update locks the user's
-- profile row, so two requests at the same moment take turns: the second one sees the first one's
-- count and cannot also take the 20th message.
create function app.chat_count_message()
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

  update app.profiles
     set chat_count = case when chat_count_date = today then chat_count + 1 else 1 end,
         chat_count_date = today
   where id = uid
     and (chat_count_date is distinct from today or chat_count < 20)
  returning chat_count into counted;

  return counted is not null;
end;
$$;

revoke all on function app.chat_count_message() from public, anon;
grant execute on function app.chat_count_message() to authenticated;

-- ---------- Messages ----------
create table app.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The order of the conversation (a user message and its answer are saved in the same moment).
  seq bigint generated always as identity,
  role text not null,
  text text not null,
  created_at timestamptz not null default now(),

  constraint chat_messages_role check (role in ('user', 'assistant')),
  constraint chat_messages_text_length check (char_length(text) between 1 and 4000),
  -- Target of the two-column link from a draft.
  constraint chat_messages_owner_and_id unique (user_id, id)
);

create index chat_messages_user_seq on app.chat_messages (user_id, seq);

-- ---------- Drafts ----------
-- The assistant's proposal: events within the next 14 days, saved as a list of
-- { "title", "start_at", "end_at" (UTC, ISO), "goal_id" (or null) }. Becomes events only when accepted.
create table app.draft_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message_id uuid not null,
  proposed_events jsonb not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),

  -- The draft's message is the same user's; deleting the message (clear_chat) deletes the draft.
  constraint draft_plans_message_of_same_user foreign key (user_id, message_id)
    references app.chat_messages (user_id, id) on delete cascade,
  -- An assistant message carries at most one draft.
  constraint draft_plans_one_per_message unique (message_id),
  constraint draft_plans_status check (status in ('open', 'accepted', 'rejected', 'replaced')),
  -- R23: 1 to 30 proposed events.
  constraint draft_plans_events_list check (
    jsonb_typeof(proposed_events) = 'array' and jsonb_array_length(proposed_events) between 1 and 30
  )
);

-- One open draft per user (ontology section 2), also when two answers arrive at the same moment.
create unique index draft_plans_one_open on app.draft_plans (user_id) where status = 'open';

-- A draft belongs to an assistant message, and its status only moves forward:
-- open -> accepted, rejected or replaced; nothing after that. "accepted" is set only by
-- app.chat_accept_draft (which runs as the owner), never by a user's own update, so a draft cannot be
-- marked accepted without its events being created.
create function app.check_draft_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'open' then
      raise exception 'A new draft is open' using errcode = '23514', constraint = 'draft_plans_status_forward';
    end if;
    if not exists (select 1 from app.chat_messages m where m.id = new.message_id and m.role = 'assistant') then
      raise exception 'A draft belongs to an assistant message' using errcode = '23514', constraint = 'draft_plans_assistant_message';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'open' then
      raise exception 'This draft is no longer open' using errcode = '23514', constraint = 'draft_plans_status_forward';
    end if;
    if new.status = 'accepted' and current_user = 'authenticated' then
      raise exception 'Only accept_draft accepts a draft' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.check_draft_plan() from public, anon, authenticated;

create trigger check_draft_plan
  before insert or update on app.draft_plans
  for each row execute function app.check_draft_plan();

-- ---------- accept_draft ----------
-- Creates the draft's events in one step with source "assistant" and marks the draft accepted (R1, R4).
-- Our server first runs R23's checks again against the calendar as it is now; this function checks
-- again what the database can: the draft is the user's and still open (under a row lock, so two
-- devices take turns and only the first one creates events), each event is timed and lasts 15 minutes
-- to 8 hours, and its goal is the user's (the events' own two-column link). Returns the new events' ids.
create function app.chat_accept_draft(p_draft_id uuid)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  draft record;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  select d.id, d.status, d.proposed_events into draft
    from app.draft_plans d where d.id = p_draft_id and d.user_id = uid for update;
  if not found then raise exception 'Not found' using errcode = 'P0002'; end if;
  if draft.status <> 'open' then
    raise exception 'This draft is no longer open' using errcode = '23514', constraint = 'draft_plans_status_forward';
  end if;

  if exists (
    select 1 from jsonb_array_elements(draft.proposed_events) x
     where (x.value ->> 'end_at')::timestamptz - (x.value ->> 'start_at')::timestamptz
           not between interval '15 minutes' and interval '8 hours'
  ) then
    raise exception 'A proposed event must last 15 minutes to 8 hours' using errcode = '23514', constraint = 'draft_plans_event_length';
  end if;

  return query
    insert into app.events (user_id, source, title, all_day, start_at, end_at, goal_id, may_overlap)
    select uid, 'assistant', x.value ->> 'title', false,
           (x.value ->> 'start_at')::timestamptz, (x.value ->> 'end_at')::timestamptz,
           nullif(x.value ->> 'goal_id', '')::uuid, false
      from jsonb_array_elements(draft.proposed_events) with ordinality as x(value, n)
     order by x.n
    returning id;

  update app.draft_plans set status = 'accepted' where id = draft.id;
end;
$$;

revoke all on function app.chat_accept_draft(uuid) from public, anon;
grant execute on function app.chat_accept_draft(uuid) to authenticated;

-- ---------- Rights ----------
-- Messages: read, add (send_message) and delete (clear_chat); never changed afterwards.
revoke all on app.chat_messages, app.draft_plans from public, anon, authenticated;
grant select, delete on app.chat_messages to authenticated;
grant insert (role, text) on app.chat_messages to authenticated;
-- Drafts: read, add (send_message), change only the status (replaced, rejected; the trigger above),
-- delete (clear_chat).
grant select, delete on app.draft_plans to authenticated;
grant insert (message_id, proposed_events) on app.draft_plans to authenticated;
grant update (status) on app.draft_plans to authenticated;
-- Not writable by users: ids, user_id, seq, created_at, and a draft's message and events once it exists.

-- Row-level security: each user reads and changes only their own messages and drafts (R3).
alter table app.chat_messages enable row level security;
alter table app.draft_plans enable row level security;

create policy "Users read their own messages" on app.chat_messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own messages" on app.chat_messages for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users delete their own messages" on app.chat_messages for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their own drafts" on app.draft_plans for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own drafts" on app.draft_plans for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users change their own drafts" on app.draft_plans for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their own drafts" on app.draft_plans for delete to authenticated
  using (user_id = (select auth.uid()));
