# Backend

Go API in `app/backend`. Domain terms are defined in `CONTEXT.md`.

## Packages

| Package | Owns |
| --- | --- |
| `cmd/server` | The only place real dependencies are built and hooks are wired (`OnCreate`, `AfterSave`). |
| `internal/config` | `.env` → `Config`, through an injected `getenv`. |
| `internal/auth` | JWKS token check (`verifier.go`), the live-session check (`sessions.go`), the User's identities from `auth.identities` (`identities.go`), the beta `Allowlist` (zero value admits nobody). See Auth below. |
| `internal/httpapi` | Routes (`router.go`), handlers, the store interfaces they need (declared next to each handler), error mapping. |
| `internal/projects` | Projects and Project Slugs. |
| `internal/architecture` | The canvas document, the Component Type catalog (`document.go`) and versioned saves. |
| `internal/conversation` | Messages, Proposals stored with them, accept and reject. |
| `internal/knowledge` | Experience Level, Requirements, Decisions, user settings. |
| `internal/usage` | The daily AI caps: `Meter.Record` logs each model call in `ai_usage` and refuses past `AI_DAILY_REPLY_LIMIT` (check + insert under a per-User advisory lock). `Budget.Spend` logs every request to OpenRouter, fallbacks included, in `ai_requests` and refuses past `AI_GLOBAL_DAILY_LIMIT` (`ErrGlobalLimit`, which is an `ErrDailyLimit`; one global advisory lock). |
| `internal/proposal` | Proposal ops, `Normalize`, `Validate`, the `propose_changes` tool schema. |
| `internal/assistant`, `internal/llm` | The AI turn and the model clients (see `docs/ai.md`). |
| `internal/testdb` | Integration helpers: `Pool(t)`, `User(t, pool, githubUsername, opts...)` (`""` = no GitHub identity; `WithGoogle(fullName)` links a Google one, so it makes GitHub-only, Google-only, linked and identity-less users). |

## Auth

- **Sessions:** a valid signature isn't enough: access tokens live for an hour. `Verifier.Verify` returns the token's `sub` and `session_id`, and `auth.Sessions.Check` requires that session to still exist in `auth.sessions` (not signed out or revoked, `not_after` not passed) and its `auth.users` row to be neither banned nor deleted. Otherwise → 401 `unauthenticated`.
- **Identities:** a User signs in with GitHub or Google. When a second provider arrives with the same verified email, Supabase links it to the same `auth.users` row (automatic linking), so one User can have both. `auth.Identities.List` reads the `github` and `google` rows of `auth.identities`, GitHub first, never `user_metadata` (users can edit it). `provider_id` is the immutable account id: the numeric GitHub id, or the Google `sub`. A GitHub row needs a `user_name`; other providers' rows are ignored. No usable identity → `auth.ErrNoIdentity` (→ 403 `identity_required`).
- **Allowlist:** `ALLOWED_GITHUB_IDS` (numeric GitHub ids) and `ALLOWED_GOOGLE_IDS` (Google subs, never emails). A User is admitted if **any** of their identities is listed under its provider. Both empty admit nobody unless `ALLOW_ALL_USERS=1`. The removed `ALLOW_ALL_GITHUB_USERS` and `ALLOWED_GITHUB_USERS` fail startup naming their replacement. Refused → 403 `not_allowed` with `identities: [{provider, id, name}]`, so the page can show the User what to ask with.
- **Display:** `User.DisplayName()` is the GitHub username if one is linked, otherwise the Google full name, otherwise the Google email. `User.AvatarURL()` comes from the same identity.

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
| 401 / 403 | `unauthenticated` / `identity_required` (no GitHub or Google identity), `not_allowed` (allowlist; +`identities`) |
| 404 | `not_found` (also other Users' Projects, bad slugs, bad `seq`/ids) |
| 409 | `conflict` (stale version), `not_pending` (Proposal already resolved), `busy` (reply in flight), `nothing_to_reply`, `limit_reached` (+detail for knowledge; see Limits) |
| 429 | `daily_limit` from `/reply` (`AI_DAILY_REPLY_LIMIT` model calls per User, or `AI_GLOBAL_DAILY_LIMIT` requests for everyone, per UTC day; 0 disables). Sending a message is never capped. |
| 502 / 503 | `ai_failed` / `ai_unavailable` (no API key, or every free model tried was busy or failing: try again shortly) |

## Limits

Every Requirement and Decision goes into each AI prompt, so storage is capped: `projects.MaxProjects` (50 per User, counted under a per-User advisory lock), `knowledge.MaxRequirements` and `MaxDecisions` (200 per Project, counted under the Project row lock), and `knowledge.MaxReferences` (50 targets and 50 cited Requirements per Decision, also a SQL `check`). Over a limit → 409 `limit_reached`. `proposal.Validate` applies the same caps so the model is told before the User accepts.

## Endpoints

All under `/api`, all need a User.

| Route | Notes |
| --- | --- |
| `GET /me` | `{displayName, avatarUrl}` (see Auth › Display) |
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

Migrations live in `supabase/migrations` (`make db-migration name=x`, `make db-reset`). Tables: `projects` (+`experience_level`), `architectures` (one jsonb document per Project), `messages`, `proposals` (`seq`, `status`, `base_version`, partial unique index = one pending per Project), `requirements`, `decisions` (`requirement_nums int[]`, `targets text[]` of canvas ids), `user_settings`, `ai_usage` (one row per model call; hangs off `auth.users`, so deleting a Project doesn't reset the count), `ai_requests` (one row per request to OpenRouter, for the global budget). `messages.model` records which model wrote an AI Message (debugging only; not sent to the client).

Every new table:
- `enable row level security` with **no policies**. Only the Go API (table owner) touches data; this keeps it out of Supabase's Data API.
- Hangs off `projects (id) on delete cascade` (or `auth.users` for per-User data), so deleting a Project or User cleans up.
- Mirrors Go validation in `check` constraints (enums, lengths). Changing an enum means a migration **and** the Go/TS lists (see `docs/recipes.md`).
