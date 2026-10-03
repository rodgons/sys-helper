-- Proposal numbers (seq) name the canvas ids of accepted items (p{seq}-{ref}), which Decisions
-- target, so a number must never be reused once its Proposal is deleted with its Message. This
-- per-Project counter only moves forward, like next_requirement_num and next_decision_num.
alter table public.projects
  add column next_proposal_seq integer not null default 1 check (next_proposal_seq > 0);

update public.projects p set
  next_proposal_seq = coalesce((select max(seq) + 1 from public.proposals pr where pr.project_id = p.id), 1);
