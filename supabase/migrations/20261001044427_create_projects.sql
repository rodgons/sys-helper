-- Projects: a system a User designs. Owned by a Supabase Auth user.
-- The API generates `id` (UUIDv7) and `slug_suffix`; only the suffix ever appears in URLs.
create table public.projects (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  slug_suffix text not null unique check (slug_suffix ~ '^[a-z0-9]{10}$'),
  name        text not null check (char_length(name) between 1 and 100 and name = btrim(name)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_user_id_updated_at_idx on public.projects (user_id, updated_at desc);

-- Only the Go API (connecting as the table owner) reads and writes projects. RLS with no policies
-- keeps them out of reach of Supabase's auto-generated Data API.
alter table public.projects enable row level security;
