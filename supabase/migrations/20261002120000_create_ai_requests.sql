-- AI requests: one row per request sent to OpenRouter, fallbacks to another model included. The
-- global daily budget (AI_GLOBAL_DAILY_LIMIT) counts these to stay within the account's free quota,
-- which every User shares. Rows belong to no User or Project, so nothing cascades: deleting either
-- must not refill the day's budget.
create table public.ai_requests (
  id         uuid primary key,
  created_at timestamptz not null default now()
);

create index ai_requests_created_at_idx on public.ai_requests (created_at);

-- Only the Go API reads and writes requests; see create_projects.
alter table public.ai_requests enable row level security;
