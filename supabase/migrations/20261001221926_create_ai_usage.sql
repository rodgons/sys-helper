-- AI usage: one row per model call, which is what costs money. The daily cap counts these. Rows hang
-- off the User, not a Project, so deleting a Project doesn't reset the count.
create table public.ai_usage (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index ai_usage_user_id_created_at_idx on public.ai_usage (user_id, created_at);

-- Only the Go API reads and writes usage; see create_projects.
alter table public.ai_usage enable row level security;
