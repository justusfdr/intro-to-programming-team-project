-- The coach keeps separate chats (spec 44): each message belongs to one chat, the coach's page lists
-- the chats by day, and "New chat" starts an empty one. Run once in the Supabase SQL editor after the
-- coach goal place file.
--
-- Additive only: the main branch runs against the same database until this is merged. Its builds
-- insert messages without a chat; a trigger puts such a message into the user's latest chat (or a new
-- one), so they keep working unchanged. Nothing existing is removed. The day counter
-- (app.chat_count_message, profiles.chat_count) stays for those builds; this branch no longer uses it.
--
-- Security model, as everywhere: the browser never talks to the database. Our server runs every query
-- as the role "authenticated" with the signed-in user's id, so row-level security limits it to the
-- user's own rows (R3).

-- ---------- Chats ----------
create table app.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The first message of the chat, on one line and cut to 80 characters.
  title text not null,
  created_at timestamptz not null default now(),
  -- The time of the chat's latest message: the page lists chats by it, newest first.
  updated_at timestamptz not null default now(),

  constraint chats_title_length check (char_length(title) between 1 and 80),
  -- Target of the two-column link from a message.
  constraint chats_owner_and_id unique (user_id, id)
);

-- The page reads a user's chats newest first.
create index chats_user_updated on app.chats (user_id, updated_at desc);

-- A chat's title: the text on one line (runs of white space as one space), trimmed, cut to 80
-- characters; "Chat" when nothing is left. The server makes the same title (src/lib/chat/chats.ts).
create function app.chat_title(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_text, ''), '[[:space:]]+', ' ', 'g')), 80)), ''),
    'Chat'
  );
$$;

revoke all on function app.chat_title(text) from public, anon;
grant execute on function app.chat_title(text) to authenticated;

-- ---------- Messages belong to a chat ----------
alter table app.chat_messages add column chat_id uuid;

-- The messages saved so far become chats: one per user and day (in the user's time zone), titled with
-- that day's first message of the user, from the day's first to its last message.
do $$
declare
  d record;
  made uuid;
begin
  for d in
    select m.user_id, coalesce(s.time_zone, 'UTC') as time_zone,
           (m.created_at at time zone coalesce(s.time_zone, 'UTC'))::date as day,
           min(m.created_at) as first_at, max(m.created_at) as last_at
      from app.chat_messages m
      left join app.settings s on s.user_id = m.user_id
     group by m.user_id, s.time_zone, day
  loop
    insert into app.chats (user_id, title, created_at, updated_at)
    values (
      d.user_id,
      app.chat_title((
        select f.text from app.chat_messages f
         where f.user_id = d.user_id and (f.created_at at time zone d.time_zone)::date = d.day
         order by (f.role = 'user') desc, f.seq
         limit 1
      )),
      d.first_at,
      d.last_at
    )
    returning id into made;

    update app.chat_messages m
       set chat_id = made
     where m.user_id = d.user_id
       and m.chat_id is null
       and (m.created_at at time zone d.time_zone)::date = d.day;
  end loop;
end;
$$;

-- A message's chat is the same user's; deleting a chat deletes its messages (and with them their drafts).
alter table app.chat_messages
  add constraint chat_messages_chat_of_same_user foreign key (user_id, chat_id)
    references app.chats (user_id, id) on delete cascade;

-- The page and send_message read one chat's messages in order.
create index chat_messages_chat_seq on app.chat_messages (chat_id, seq);

-- Every new message gets a chat: a message saved without one (the main branch's builds) goes into the
-- user's latest chat, or a new chat titled with it when the user has none. Each message moves its
-- chat's updated_at to its own time. Runs as the owner so it can make that chat for the message's own
-- user: the user cannot write user_id on a message (no grant; it defaults to auth.uid()), and the
-- two-column link above makes sure a chat named by the caller is the same user's.
create function app.chat_message_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.chat_id is null then
    select c.id into new.chat_id
      from app.chats c
     where c.user_id = new.user_id
     order by c.updated_at desc, c.created_at desc
     limit 1;
    if new.chat_id is null then
      insert into app.chats (user_id, title, created_at, updated_at)
      values (new.user_id, app.chat_title(new.text), new.created_at, new.created_at)
      returning id into new.chat_id;
    end if;
  end if;

  update app.chats
     set updated_at = greatest(updated_at, new.created_at)
   where id = new.chat_id
     and user_id = new.user_id;
  return new;
end;
$$;

revoke all on function app.chat_message_chat() from public, anon, authenticated;

create trigger chat_message_chat
  before insert on app.chat_messages
  for each row execute function app.chat_message_chat();

-- With the trigger every message has a chat.
alter table app.chat_messages alter column chat_id set not null;

-- A chat lives as long as it has messages: when the last one goes (the main branch's "Clear chat"
-- deletes messages, not chats), the chat goes too, so the list never shows an empty chat. Our server
-- makes a chat together with its first turn, in one transaction, so it is never empty for long.
create function app.chat_message_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from app.chats c
   where c.id = old.chat_id
     and c.user_id = old.user_id
     and not exists (select 1 from app.chat_messages m where m.chat_id = old.chat_id);
  return null;
end;
$$;

revoke all on function app.chat_message_gone() from public, anon, authenticated;

create trigger chat_message_gone
  after delete on app.chat_messages
  for each row execute function app.chat_message_gone();

-- ---------- Privileges and row-level security ----------
-- A user reads, starts and deletes their own chats; the title is written once, by our server, when the
-- chat starts; updated_at moves only through the trigger.
revoke all on app.chats from public, anon, authenticated;
grant select, delete on app.chats to authenticated;
grant insert (title) on app.chats to authenticated;
-- A message may name its chat.
grant insert (chat_id) on app.chat_messages to authenticated;

alter table app.chats enable row level security;

create policy "Users read their own chats" on app.chats for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users start their own chats" on app.chats for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users delete their own chats" on app.chats for delete to authenticated
  using (user_id = (select auth.uid()));
