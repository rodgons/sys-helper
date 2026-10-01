-- Mirrors knowledge.MaxReferences: a Decision is attached to at most 50 items and cites at most 50
-- Requirements. (The per-Project counts of Requirements and Decisions are checked in Go, under the
-- Project's row lock.)
alter table public.decisions
  add constraint decisions_targets_max check (cardinality(targets) <= 50),
  add constraint decisions_requirement_nums_max check (cardinality(requirement_nums) <= 50);
