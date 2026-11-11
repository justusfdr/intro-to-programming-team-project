-- Build step 2: goals and their weekly rules (spec 03), and the goal of an event.
-- Run this file once in the Supabase SQL editor after the events file (see docs/setup.md).
--
-- Ownership is part of every link: a rule and an event point to a goal through the pair
-- (user_id, goal_id). Each row's user_id is always the signed-in user (row-level security), so the
-- database itself refuses a link to another user's goal, even when someone knows its id.

create table app.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  deadline date not null,
  auto_block boolean not null default false,
  -- Both set by the database, never by the user.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint goals_title_length check (char_length(title) between 1 and 80),
  -- Target of the two-column links below.
  constraint goals_owner_and_id unique (user_id, id)
);

create table app.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  goal_id uuid not null,
  kind text not null,
  target numeric(4, 1) not null,
  min_minutes integer,

  constraint rules_goal_of_same_user foreign key (user_id, goal_id)
    references app.goals (user_id, id) on delete cascade,
  constraint rules_kind check (kind in ('count', 'hours')),
  -- R7: count 1 to 14 events per week, whole numbers.
  constraint rules_count_target check (kind <> 'count' or (target between 1 and 14 and target = trunc(target))),
  -- R7: hours 0.5 to 60 per week, in steps of 0.5.
  constraint rules_hours_target check (kind <> 'hours' or (target between 0.5 and 60 and target * 2 = trunc(target * 2))),
  -- R7: a minimum length of 15 to 240 minutes, only for count rules.
  constraint rules_min_minutes check (min_minutes is null or (kind = 'count' and min_minutes between 15 and 240))
);

create index rules_goal on app.rules (goal_id);

-- The goal of an event (ontology: a timed event belongs to at most one goal). Deleting the goal
-- keeps the event and only empties goal_id ("set null (goal_id)" leaves user_id alone).
alter table app.events add column goal_id uuid;
alter table app.events add constraint events_goal_of_same_user foreign key (user_id, goal_id)
  references app.goals (user_id, id) on delete set null (goal_id);
create index events_user_goal on app.events (user_id, goal_id);

-- A goal always has at least one rule (R7). Checked when the transaction ends, so a goal and its
-- rules can be written in any order within one step, and deleting a goal with its rules is fine.
-- (Trigger functions run without an EXECUTE grant; a helper function they called would need one,
-- so each trigger function carries the check itself.)
create function app.check_new_goal_has_rule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from app.rules where goal_id = new.id) then
    raise exception 'A goal needs at least one rule' using errcode = '23514', constraint = 'goals_need_a_rule';
  end if;
  return null;
end;
$$;

create function app.check_goal_keeps_a_rule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Deleting the whole goal (its rules go with it) is fine.
  if exists (select 1 from app.goals where id = old.goal_id)
     and not exists (select 1 from app.rules where goal_id = old.goal_id) then
    raise exception 'A goal needs at least one rule' using errcode = '23514', constraint = 'goals_need_a_rule';
  end if;
  return null;
end;
$$;

revoke all on function app.check_new_goal_has_rule(), app.check_goal_keeps_a_rule() from public, anon, authenticated;

create constraint trigger goals_need_a_rule_on_insert
  after insert on app.goals
  deferrable initially deferred
  for each row execute function app.check_new_goal_has_rule();

create constraint trigger goals_need_a_rule_on_rule_delete
  after delete on app.rules
  deferrable initially deferred
  for each row execute function app.check_goal_keeps_a_rule();

-- updated_at for goals: the same rule as for events (whole milliseconds, always growing).
create function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := greatest(
      date_trunc('milliseconds', pg_catalog.clock_timestamp()),
      old.updated_at + interval '1 millisecond'
    );
  else
    new.updated_at := date_trunc('milliseconds', pg_catalog.clock_timestamp());
  end if;
  return new;
end;
$$;

revoke all on function app.set_updated_at() from public, anon, authenticated;

create trigger set_goals_updated_at
  before insert or update on app.goals
  for each row execute function app.set_updated_at();

-- Rights: only the role "authenticated", and only these columns.
revoke all on app.goals, app.rules from public, anon, authenticated;
grant select, delete on app.goals, app.rules to authenticated;
grant insert (title, deadline, auto_block), update (title, deadline, auto_block) on app.goals to authenticated;
grant insert (goal_id, kind, target, min_minutes), update (kind, target, min_minutes) on app.rules to authenticated;
grant insert (goal_id), update (goal_id) on app.events to authenticated;
-- Not writable by users: ids, user_id, created_at, updated_at, and a rule's goal once it exists.

-- Row-level security: each user reads and changes only their own goals and rules (R3).
alter table app.goals enable row level security;
alter table app.rules enable row level security;

create policy "Users read their own goals" on app.goals for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own goals" on app.goals for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users change their own goals" on app.goals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their own goals" on app.goals for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their own rules" on app.rules for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add their own rules" on app.rules for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users change their own rules" on app.rules for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their own rules" on app.rules for delete to authenticated
  using (user_id = (select auth.uid()));
