-- The Project's knowledge besides the canvas: the User's Experience Level, the Requirements, and
-- the Decisions that explain the Architecture. Requirements and Decisions are numbered per Project
-- (R1, D1, …); those numbers are how the API and the AI refer to them.
alter table public.projects
  add column experience_level text check (experience_level in ('beginner', 'intermediate', 'expert'));

create table public.requirements (
  id         uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  num        integer not null check (num > 0),
  category   text not null check (category in
               ('scale', 'performance', 'availability', 'consistency', 'security', 'cost', 'constraints', 'functional')),
  statement  text not null check (char_length(statement) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, num)
);

-- `requirement_nums` cite Requirements by number; `targets` are Component and Connection ids
-- inside the Architecture document. Both are arrays: they only ever point within one Project.
create table public.decisions (
  id               uuid primary key,
  project_id       uuid not null references public.projects (id) on delete cascade,
  num              integer not null check (num > 0),
  title            text not null check (char_length(title) between 1 and 120),
  rationale        text not null check (char_length(rationale) <= 2000),
  pattern          text not null default '' check (char_length(pattern) <= 120),
  alternative      text not null default '' check (char_length(alternative) <= 1000),
  requirement_nums integer[] not null default '{}',
  targets          text[] not null check (cardinality(targets) > 0),
  author           text not null check (author in ('user', 'ai')),
  needs_review     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (project_id, num)
);

alter table public.requirements enable row level security;
alter table public.decisions enable row level security;
