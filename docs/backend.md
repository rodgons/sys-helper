# Backend

Go API in `app/backend`. Domain terms are defined in `CONTEXT.md`.

## Packages

| Package | Owns |
| --- | --- |
| `cmd/server` | The only place real dependencies are built and hooks are wired (`OnCreate`, `AfterSave`). |
| `internal/config` | `.env` → `Config`, through an injected `getenv`. |
| `internal/auth` | JWKS token check (`verifier.go`), GitHub identity from `auth.identities` (`identities.go`; `provider_id` is the numeric GitHub id), the beta `Allowlist` (zero value admits nobody). |
| `internal/httpapi` | Routes (`router.go`), handlers, the store interfaces they need (declared next to each handler), error mapping. |
| `internal/projects` | Projects and Project Slugs. |
| `internal/architecture` | The canvas document, the Component Type catalog (`document.go`) and versioned saves. |
| `internal/conversation` | Messages, Proposals stored with them, accept and reject. |
| `internal/knowledge` | Experience Level, Requirements, Decisions, user settings. |
| `internal/usage` | The daily AI cap: `Meter.Record` logs each model call in `ai_usage` and refuses past `AI_DAILY_REPLY_LIMIT` (check + insert under a per-User advisory lock). |
| `internal/proposal` | Proposal ops, `Normalize`, `Validate`, the `propose_changes` tool schema. |
| `internal/assistant`, `internal/llm` | The AI turn and the model clients (see `docs/ai.md`). |
| `internal/testdb` | Integration helpers: `Pool(t)`, `User(t, pool, githubUsername)`. |

## Rules every store follows

- **Ownership:** every query is scoped by `user_id` + `slug_suffix`. Another User's Project behaves like a missing one: return `projects.ErrNotFound` (→ 404), never 403.
- **Slugs:** only the 10-char suffix identifies a Project. `withSuffix` parses `{slug}`; malformed slugs are 404. Project UUIDs never leave the API.
- **Locking:** any write whose correctness depends on per-Project state (versions, `seq`, `num`, "one pending Proposal") runs in a transaction that first does `SELECT … FROM projects … FOR UPDATE`. Reuse `knowledge.Store.inProject` or the same pattern.
- **Hooks run inside the caller's transaction** (`func(ctx, tx pgx.Tx, projectID …) error`); an error rolls everything back:
  - `projects.Store.OnCreate` = `conversation.AddWelcome`.
  - `architecture.Store.AfterSave` = `knowledge.PruneDecisions` (drops vanished targets, deletes Decisions left with none).
  - `architecture.Store.SaveWith(…, also)`: `also` runs after the version check. Accepting a Proposal passes `conversation.Accept(seq)`.
- **Versioned Architecture:** `architectures.version` starts at 0 (no row). A save carries its base version; a mismatch returns `architecture.ErrConflict` (→ 409 `conflict`) and saves nothing.
- **IDs:** new rows use UUIDv7 generated in Go (`uuid.NewV7()`), which also orders Messages. Requirements and Decisions are numbered per Project (`num`), shown as `R1`/`D1` (`knowledge.RequirementID`, `ParseRequirementID`). Numbers come from the forward-only counters `projects.next_requirement_num` / `next_decision_num`, so a deleted item's number is never reused (anything seeding these tables directly must advance them too).
- **Package-level functions taking a `DB`/`pgx.Tx`** (e.g. `knowledge.Load`, `knowledge.AddRequirement`) exist so other packages can act inside their own transaction. Store methods wrap them with ownership + locking.
- **Effective Experience Level:** `knowledge.Load` coalesces `projects.experience_level` with `user_settings.experience_level`. Read the level only through it.

## HTTP conventions

- Routes are Go 1.22+ `ServeMux` patterns in `router.go`, each wrapped in `user(…)` (= `requireUser`) except `/health` and `/ready`. `userFrom(ctx)` returns the User.
- Decode bodies with `decodeStrict` (64 KB cap, unknown fields rejected → 400 `invalid_json`). Architecture bodies use `readVersionedDocument` (2 MB, validates the document).
- Errors are `{"error": "<code>"}`, plus `detail` for validation errors. `respond(w, r, status, body, err)` maps store errors for knowledge-style handlers; `internalError` logs and returns 500 `internal`.
- The frontend switches on these codes (`ApiError.code`), so treat them as API.

| Status | Codes |
| --- | --- |
| 400 | `invalid_json`, `invalid_name`, `invalid_message`, `invalid_architecture` (+detail), `invalid` (+detail, knowledge) |
| 401 / 403 | `unauthenticated` / `github_required`, `not_allowed` (allowlist) |
| 404 | `not_found` (also other Users' Projects, bad slugs, bad `seq`/ids) |
| 409 | `conflict` (stale version), `not_pending` (Proposal already resolved), `busy` (reply in flight), `nothing_to_reply` |
| 429 | `daily_limit` from `/reply` (`AI_DAILY_REPLY_LIMIT` model calls per User per UTC day; 0 disables). Sending a message is never capped. |
| 502 / 503 | `ai_failed` / `ai_unavailable` (no API key) |

## Endpoints

All under `/api`, all need a User.

| Route | Notes |
| --- | --- |
| `GET /me` | `{username, avatarUrl}` |
| `GET, PUT /settings` | `{experienceLevel}`; `""` clears the default |
| `GET, POST /projects` · `GET, PATCH, DELETE /projects/{slug}` | `{slug, name, updatedAt}`; list is newest first |
| `GET, PUT /projects/{slug}/architecture` | `{version, document}`; PUT returns the new `version` |
| `GET, POST /projects/{slug}/messages` | POST takes `{body}`; role is always `user` |
| `POST /projects/{slug}/reply` | SSE `delta` / `done` / `error`; see `docs/ai.md` |
| `POST /projects/{slug}/proposals/{seq}/accept` | body `{version, document}` = the canvas with the Proposal applied |
| `POST /projects/{slug}/proposals/{seq}/reject` | |
| `GET /projects/{slug}/knowledge` | `{experienceLevel, requirements, decisions}` |
| `POST /projects/{slug}/requirements` · `PATCH, DELETE …/requirements/{id}` | `{id}` = `R1`; changing or removing one sets `needsReview` on Decisions citing it |
| `POST /projects/{slug}/decisions` · `PATCH, DELETE …/decisions/{id}` | `{id}` = `D1`; any PATCH (even `{}`) clears `needsReview` |
| `PUT /projects/{slug}/experience-level` | `{level}` |

## Database

Migrations live in `supabase/migrations` (`make db-migration name=x`, `make db-reset`). Tables: `projects` (+`experience_level`), `architectures` (one jsonb document per Project), `messages`, `proposals` (`seq`, `status`, `base_version`, partial unique index = one pending per Project), `requirements`, `decisions` (`requirement_nums int[]`, `targets text[]` of canvas ids), `user_settings`, `ai_usage` (one row per model call; hangs off `auth.users`, so deleting a Project doesn't reset the count).

Every new table:
- `enable row level security` with **no policies**. Only the Go API (table owner) touches data; this keeps it out of Supabase's Data API.
- Hangs off `projects (id) on delete cascade` (or `auth.users` for per-User data), so deleting a Project or User cleans up.
- Mirrors Go validation in `check` constraints (enums, lengths). Changing an enum means a migration **and** the Go/TS lists (see `docs/recipes.md`).
