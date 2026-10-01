-- One Architecture per Project: the canvas document and a version that increases on every save.
-- Saves carry the version they were based on, so a stale save (another tab, a pending Proposal)
-- is detected instead of silently overwriting newer work.
create table public.architectures (
  project_id uuid primary key references public.projects (id) on delete cascade,
  document   jsonb not null,
  version    integer not null check (version > 0),
  updated_at timestamptz not null default now()
);

alter table public.architectures enable row level security;
