# Recipes

Checklists of every place a change must reach. Several lists are duplicated across Go, TypeScript and SQL with no generator, so a missed spot fails only at runtime. Write the failing test first in each layer.

## Component Type or Connection kind

1. `app/backend/internal/architecture/document.go`: `ComponentTypes` (type → allowed property keys) or `ConnectionKinds`.
2. `app/frontend/src/architecture/model.ts`: `COMPONENT_TYPES` (label, property fields with placeholders) or `ConnectionKind` + `CONNECTION_KINDS`.
3. `app/frontend/src/architecture/shapes.tsx`: `LOOKS` (Lucide icon + shape). Add a new shape to `SHAPES` only if none fits.
4. `app/backend/internal/proposal/proposal.go`: `typeName` if the default name needs an acronym (like `api`, `cdn`, `dns`). The tool schema enum is generated from the catalog.
5. Connection kind only: `architectureNote` in `internal/assistant/prompt.go` lists the kinds.

## Requirement category or Experience Level

1. `internal/knowledge/knowledge.go`: `Categories` / `Levels` (the tool schema enum follows).
2. A new migration replacing the `check` constraints: `requirements.category`, or `projects.experience_level` **and** `user_settings.experience_level`.
3. `app/frontend/src/lib/knowledge.ts`: `CATEGORIES` / `LEVELS`.

## Proposal op

1. `internal/proposal/proposal.go`: document the fields on `Change` (add fields if needed), `ops`, a `Validate` case with model-readable errors, the `toolSchema` field descriptions, and `inferOp`/`Normalize` if models are likely to omit it.
2. Canvas op: apply it on the client (step 4). Knowledge op: apply it in `conversation.applyKnowledge` (`internal/conversation/proposals.go`), leniently.
3. `internal/llm/fake.go`: extend `FakeProposal` if E2E should cover it.
4. `app/frontend/src/architecture/proposal.ts`: `ProposalChange.op`, plus `staleReason`, `applyProposal`, `previewProposal` (diff marking) and `describeChange`. TypeScript's exhaustive switches flag most of them.
5. `internal/assistant/prompt.go` if the model needs guidance to use it.

## Endpoint

1. Handler in `internal/httpapi/<resource>.go`, depending on a small interface declared there (the methods it needs, nothing more).
2. Route in `router.go`, wrapped in `user(…)`; add the interface to `Deps`.
3. Wire the real implementation in `cmd/server/main.go`.
4. Unit test the handler with a fake (`httptest`). Integration test the store (`*_integration_test.go`, `testdb`), including that another User gets `ErrNotFound`.
5. Frontend hook in `src/lib/<resource>.ts` with a `slugSuffix`-based query key. Decide which caches it updates or invalidates (`docs/frontend.md`).
6. New error codes: add them to the table in `docs/backend.md`.

## Table

1. `make db-migration name=create_x`: RLS enabled with no policies, `on delete cascade` to `projects`/`auth.users`, `check` constraints mirroring Go validation (`docs/backend.md`).
2. Store in the owning package: queries scoped by `user_id` + `slug_suffix`, the Project row lock for per-Project counters or invariants, UUIDv7 ids.
3. If it must change atomically with the canvas, run it as a `SaveWith` hook instead of a separate transaction.
4. `make db-reset`, then `make test-integration`.

## UI component

1. `src/ui/<name>.tsx` using tokens only. Add a test for behaviour (keyboard, ARIA), not looks.
2. Show every variant on `/ui-kit` (`src/pages/ui-kit.tsx`).
3. Domain-specific UI goes in its feature folder, not `src/ui/`.
