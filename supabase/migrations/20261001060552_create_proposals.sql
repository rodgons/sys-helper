-- Proposals: changes to the Architecture the AI suggests in a Message. `seq` numbers them per
-- Project and is how the API addresses them. A Project has at most one pending Proposal; a new
-- one supersedes it.
create table public.proposals (
  id           uuid primary key,
  project_id   uuid not null references public.projects (id) on delete cascade,
  message_id   uuid not null unique references public.messages (id) on delete cascade,
  seq          integer not null check (seq > 0),
  base_version integer not null check (base_version >= 0),
  summary      text not null,
  changes      jsonb not null,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'rejected', 'superseded')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  unique (project_id, seq)
);

create unique index proposals_one_pending_per_project on public.proposals (project_id)
  where status = 'pending';

alter table public.proposals enable row level security;
