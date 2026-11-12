-- A goal's colour, icon and reason, the demo week, and the welcome (spec 13, branch prototype-style).
-- Run once in the Supabase SQL editor after the settings and account file.
--
-- Additive only: the main branch runs against the same database. Every new column has a default that
-- main can ignore; main's inserts name only their own columns and keep working. A goal without a
-- stored colour (every goal main creates) is shown in the colour calculated from its place in the list.

-- ---------- A goal's look ----------
alter table app.goals
  -- One of the ten colours, or empty: then the colour comes from the goal's place in the list.
  add column color text,
  -- One of the ten icons.
  add column icon text not null default 'rocket',
  -- "Why it matters": one short sentence, or empty.
  add column why text not null default '',
  -- Created by "Explore the demo" (load_demo); "Remove the demo data" (remove_demo) deletes it.
  add column demo boolean not null default false;

alter table app.goals
  add constraint goals_color check (
    color is null or color in ('rose', 'teal', 'indigo', 'amber', 'emerald', 'pink', 'sky', 'violet', 'orange', 'slate')
  ),
  add constraint goals_icon check (
    icon in ('rocket', 'footprints', 'heart', 'video', 'book', 'dumbbell', 'briefcase', 'graduation', 'palette', 'code')
  ),
  add constraint goals_why_length check (char_length(why) <= 200);

-- ---------- The demo mark on events and tasks ----------
-- A goal's rules go with the goal, so they need no mark of their own.
alter table app.events add column demo boolean not null default false;
alter table app.tasks add column demo boolean not null default false;

-- ---------- The welcome ----------
-- Set once the welcome was answered ("Explore the demo" or "Start fresh"); it is not shown again.
alter table app.settings add column welcome_answered boolean not null default false;

-- ---------- Rights ----------
-- Users write the look of their own goals. The demo mark is set only when a row is added (load_demo
-- runs as the user); it can never be changed afterwards, so a row cannot move in or out of the demo.
grant insert (color, icon, why, demo), update (color, icon, why) on app.goals to authenticated;
grant insert (demo) on app.events to authenticated;
grant insert (demo) on app.tasks to authenticated;
grant update (welcome_answered) on app.settings to authenticated;

-- Finding a user's demo rows quickly.
create index goals_user_demo on app.goals (user_id) where demo;
create index events_user_demo on app.events (user_id) where demo;
create index tasks_user_demo on app.tasks (user_id) where demo;
