-- Tasks under goals (spec 11; ontology change of 12 Nov 2026).
-- Run this file once in the Supabase SQL editor after the Outlook file (see docs/setup.md).
--
-- A task points to a goal through the pair (user_id, goal_id), as an event does. Each row's user_id is
-- always the signed-in user (row-level security), so the database itself refuses a link to another
-- user's goal, even when someone knows its id. Deleting the goal keeps the task and only empties
-- goal_id: the task then shows under "Inbox" (R32, A17).

create table app.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  goal_id uuid,
  due_date date,
  status text not null default 'open',
  -- Set by the database when the task becomes done, emptied when it is reopened.
  done_at timestamptz,
  -- Both set by the database, never by the user.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tasks_goal_of_same_user foreign key (user_id, goal_id)
    references app.goals (user_id, id) on delete set null (goal_id),
  constraint tasks_title_length check (char_length(title) between 1 and 100),
  constraint tasks_status check (status in ('open', 'done')),
  constraint tasks_done_at check ((status = 'done') = (done_at is not null))
);

create index tasks_user_status on app.tasks (user_id, status);
create index tasks_user_goal on app.tasks (user_id, goal_id);

-- done_at follows the status, from the database's clock: set when a task becomes done, kept while it
-- stays done, emptied when it is reopened. Users cannot write done_at (see the grants below).
create function app.set_task_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.done_at := pg_catalog.now();
    else
      new.done_at := old.done_at;
    end if;
  else
    new.done_at := null;
  end if;
  return new;
end;
$$;

revoke all on function app.set_task_done_at() from public, anon, authenticated;

create trigger set_tasks_done_at
  before insert or update on app.tasks
  for each row execute function app.set_task_done_at();

-- updated_at: the same rule as for events and goals.
create trigger set_tasks_updated_at
  before insert or update on app.tasks
  for each row execute function app.set_updated_at();

-- R32: at most 100 open tasks per user, checked when a task is added open or reopened. The lock makes
-- two requests at the same moment take turns, so the second one sees the first one's task.
create function app.check_open_tasks_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status <> 'open') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('open_tasks:' || new.user_id::text));
    if (select count(*) from app.tasks where user_id = new.user_id and status = 'open') >= 100 then
      raise exception 'You can have at most 100 open tasks' using errcode = '23514', constraint = 'tasks_at_most_100_open';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.check_open_tasks_limit() from public, anon, authenticated;

create trigger tasks_at_most_100_open
  before insert or update of status on app.tasks
  for each row execute function app.check_open_tasks_limit();

-- Rights: only the role "authenticated", and only these columns. A new task always starts open, so
-- status is not part of the insert grant.
revoke all on app.tasks from public, anon, authenticated;
grant select, delete on app.tasks to authenticated;
grant insert (title, goal_id, due_date) on app.tasks to authenticated;
grant update (title, goal_id, due_date, status) on app.tasks to authenticated;
-- Not writable by users: id, user_id, done_at, created_at, updated_at.

-- Row-level security: each user reads and changes only their own tasks (R3).
alter table app.tasks enable row level security;

create policy "Users read their own tasks" on app.tasks for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own tasks" on app.tasks for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users change their own tasks" on app.tasks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their own tasks" on app.tasks for delete to authenticated
  using (user_id = (select auth.uid()));
