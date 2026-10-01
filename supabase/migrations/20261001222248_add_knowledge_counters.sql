-- Requirement and Decision numbers (R3, D3) are ids the User, the UI and the AI rely on, so a
-- deleted item's number must never go to a new one. These per-Project counters only move forward.
alter table public.projects
  add column next_requirement_num integer not null default 1 check (next_requirement_num > 0),
  add column next_decision_num    integer not null default 1 check (next_decision_num > 0);

update public.projects p set
  next_requirement_num = coalesce((select max(num) + 1 from public.requirements r where r.project_id = p.id), 1),
  next_decision_num    = coalesce((select max(num) + 1 from public.decisions d where d.project_id = p.id), 1);
