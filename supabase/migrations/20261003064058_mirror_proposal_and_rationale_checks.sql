-- Mirror Go validation that these columns lacked: a Decision's rationale is 1 to 2000 characters
-- (knowledge.CheckDecisionText), and a Proposal has a 1 to 500 character summary and 1 to 50 changes
-- (proposal.Validate).
alter table public.decisions
  drop constraint decisions_rationale_check,
  add constraint decisions_rationale_check check (char_length(rationale) between 1 and 2000);

alter table public.proposals
  add constraint proposals_summary_check check (char_length(summary) between 1 and 500),
  add constraint proposals_changes_check check (
    jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) between 1 and 50);
