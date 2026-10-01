-- A User's settings across their Projects. `experience_level` is the default Experience Level:
-- a Project that hasn't recorded its own uses it, so the AI doesn't ask again in every Project.
create table public.user_settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  experience_level text check (experience_level in ('beginner', 'intermediate', 'expert')),
  updated_at       timestamptz not null default now()
);

-- Only the Go API reads and writes settings; see create_projects.
alter table public.user_settings enable row level security;
