# sys-helper

A workspace where you design a software system's architecture on a canvas while an AI guides you through the design and explains the reasoning behind it. Tell it what you are building, answer its questions about traffic, data and constraints, and review every change as a Proposal you accept or reject as a whole.

![The sys-helper workspace: a social app's architecture canvas in the middle, and the AI's conversation on the right with a pending proposal to add hashtag search.](app/frontend/src/assets/workspace-light.webp)

| Part     | Stack                                                                 | Path            |
| -------- | --------------------------------------------------------------------- | --------------- |
| Backend  | Go (stdlib `net/http` ServeMux), pgx → Supabase Postgres               | `app/backend`   |
| Frontend | React + Vite, TypeScript, React Router, StyleX, TanStack Query, supabase-js, Biome | `app/frontend`  |
| Database | Supabase local stack via Supabase CLI (Docker)                        | `supabase`      |

The root only holds shared config (`Makefile`, `.env`, `biome.json`, pnpm workspace). Run `make` to list every command.

## Prerequisites

Go 1.27+, Node 24+, pnpm 12, Docker (running).

## Quick start

```sh
make setup   # creates .env, installs Node/Go deps and Playwright's Chromium
make dev     # starts Supabase, then the API (:8080, live reload via Air) and Vite (:5173)
```

Saving a `.go` file rebuilds and restarts the API through [Air](https://github.com/air-verse/air) (`app/backend/.air.toml`). The old server gets SIGINT, so it shuts down gracefully. Air is a Go tool dependency in `go.mod`, so there's nothing to install globally.

**Ctrl-C** stops everything gracefully. Air and Vite get SIGTERM, and Air passes it to the API so it drains in-flight requests. Anything still running after `DEV_STOP_TIMEOUT` seconds (default 15) is force-killed. Then Supabase stops (your data is kept). If either the API or Vite crashes, the same shutdown runs. Use `make dev KEEP_SUPABASE=1` to leave Supabase running for faster restarts.

- App: http://localhost:5173
- API: http://localhost:8080/health (liveness), `/ready` (checks the DB)
- Supabase Studio: http://127.0.0.1:54323

## How the pieces connect

```
browser ──TanStack Query──▶ Go API (:8080) ──pgx──▶ Supabase Postgres (:54322)
   └──────── supabase-js ────────▶ Supabase API (:54321)  (auth, storage, realtime)
```

Every app reads the single root `.env` (Make exports it, and Vite's `envDir` points at the root). `VITE_*` values are baked into the frontend bundle at build time.

## Configuration

Everything comes from the root `.env` (copied from `.env.example` by `make setup`). The values you are most likely to change:

| Variable | What it does |
| --- | --- |
| `ALLOWED_GITHUB_IDS` | Beta allowlist of immutable numeric GitHub ids. Get an id from `https://api.github.com/users/<name>`. |
| `ALLOWED_GOOGLE_IDS` | Beta allowlist of Google account ids (the `sub`, never an email: emails can be reassigned). Nobody knows theirs offhand, so the not-allowed page shows a signed-in person their Google id with a copy button; they send it to you. |
| `ALLOW_ALL_USERS=1` | Admits everyone on any provider. A User is admitted if any of their identities is listed; with both lists empty and this unset, nobody can sign in. `ALLOW_ALL_GITHUB_USERS` was removed: the API refuses to start while it is set. |
| `OPENROUTER_API_KEY` | The assistant uses OpenRouter's free models, discovered at runtime and tried best first. No key → the API runs, AI replies answer "unavailable". The account must allow free endpoints, which may log or train on prompts. `AI_PROVIDER`, `AI_MODEL`, `AI_FALLBACK_MODEL` and the NVIDIA/Gemini keys were removed: the API refuses to start while one is set. |
| `AI_MODELS`, `AI_EXCLUDE_MODELS` | Optional: pin free models (in order, skipping discovery), or leave some out. |
| `AI_DAILY_REPLY_LIMIT` | Model calls per User per UTC day (retries included); `0` disables. Sending a message is never capped. |
| `AI_GLOBAL_DAILY_LIMIT` | Requests to OpenRouter per UTC day for all Users together, fallbacks included (default 50, the free quota; 1000 after buying $10 of credit). `0` disables. |
| `AI_FAKE=1` | Canned model, no network. E2E sets it. |
| `SHUTDOWN_TIMEOUT` | How long a stopping API lets requests finish (default `10s`). AI replies stream for up to 3 minutes and are saved only when complete, so in production set it to about `200s` and give the container a stop grace period longer than that, or replies in flight during a deploy are lost. |
| `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` / `_SECRET` | The GitHub OAuth app used by local Supabase sign-in. Callback: `http://127.0.0.1:54321/auth/v1/callback`. |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` | The Google OAuth client used by local Supabase sign-in (optional: without it only the Google button fails). Authorised redirect URI: `http://127.0.0.1:54321/auth/v1/callback`. Local Google sign-in needs `skip_nonce_check = true`, already set in `supabase/config.toml`. |
| `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend endpoints; read by Vite in dev, baked into the bundle at build. |

## Database

```sh
make db-migration name=create_profiles   # new file in supabase/migrations
make db-reset                            # re-apply all migrations + supabase/seed.sql
```

## Common commands

| Command | What it does |
| --- | --- |
| `make setup` / `make dev` | Install deps; Supabase + API (Air) + Vite |
| `make test` | Unit tests, both apps (no Supabase needed) |
| `make test-integration` / `make test-e2e` | Need Supabase running (`make supabase-start`) |
| `make test-all` | lint + unit + integration + E2E — what CI (`.github/workflows/ci.yml`) runs, plus `govulncheck` and `pnpm audit` |
| `make lint` / `make format` | tsc + Biome + gofmt + go vet / auto-fix |
| `make test-ai-live` | Check the configured models stream and call tools (costs credits) |
| `make build` | Both production Docker images |
| `make demo-screenshots` | Recapture the home page's workspace screenshots |

## TDD strategy

Work in **red → green → refactor** cycles. Write the failing test first, make it pass with the simplest code, then clean up while it stays green. Keep a watcher running:

```sh
make test-watch-backend    # gotestsum --watch
make test-watch-frontend   # vitest watch
```

### Test layers

| Layer                  | Backend                                                       | Frontend                                                             | Needs Supabase | Command                 |
| ---------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- | :------------: | ----------------------- |
| Unit / component       | `*_test.go` next to the code, `testing` + `httptest`, fakes via small interfaces | `src/**/*.test.tsx`: Vitest + Testing Library (happy-dom), `fetch` stubbed | no             | `make test`             |
| Integration            | `*_integration_test.go` with `//go:build integration`, real Postgres | (covered by E2E)                                                   | yes            | `make test-integration` |
| End-to-end             | n/a                                                           | `app/frontend/e2e/*.spec.ts`: Playwright boots the API and Vite     | yes            | `make test-e2e`         |

`make test-all` runs lint, unit, integration and E2E. CI (`.github/workflows/ci.yml`) runs the same on every push and PR, plus `govulncheck` and `pnpm audit`.

### Conventions

- **Most tests are unit tests.** They're fast and have no I/O. Integration tests cover the SQL/pgx boundary. E2E tests cover only critical user journeys.
- **Backend seams:** handlers depend on small interfaces (e.g. `httpapi.Pinger`) passed in through `httpapi.Deps`. Tests pass fakes, and `main` passes the real pgx pool. Config is loaded through an injected `getenv`.
- **Backend style:** black-box tests (`package foo_test`), table-driven where several cases share one shape, and `t.Run` subtests named after behaviour.
- **Frontend:** test behaviour through what the user sees (`screen.findByRole/Text`), not implementation details. Render with `renderWithQuery` from `src/test/render.tsx`, which gives a fresh, retry-less QueryClient per test. Stub network calls with `vi.stubGlobal('fetch', …)`. Vitest runs with fixed `VITE_*` test env values (see `vite.config.ts`).
- **Coverage** (`make coverage`) is a signal, not a goal.

## Production images

```sh
make build   # → sys-helper/backend:latest, sys-helper/frontend:latest
```

- **backend:** a static Go binary on `scratch`, running as a non-root user (~12 MB). It needs `DATABASE_URL` and `CORS_ALLOWED_ORIGINS`, and `PORT` (default 8080) can be overridden.
- **frontend:** the Vite build served by `static-web-server` with SPA fallback, compression and `/health`, running as a non-root user on port 8080 (~11 MB). It sends security headers on every response, including a Content-Security-Policy built from `VITE_API_URL` and `VITE_SUPABASE_URL`: the page may only connect to itself, the API and Supabase, and load images only from itself and GitHub and Google avatars. Pass the production `VITE_*` values at build time:

  ```sh
  make build-frontend VITE_API_URL=https://api.example.com VITE_SUPABASE_URL=… VITE_SUPABASE_PUBLISHABLE_KEY=…
  ```

**Hosted Supabase:** `supabase/config.toml` only configures the local stack. In the hosted project's Auth settings, enable only GitHub and Google, and turn the **Email** provider off. Otherwise an email/password account could end up linked to someone's GitHub or Google identity. Keep automatic linking on (the default): it is what gives a person who signs in with both providers under the same verified email one User and one set of Projects (`docs/adr/0002-multi-provider-sign-in.md`).

**Google sign-in in production:**

1. In the Google Cloud console, configure the OAuth consent screen (External; app name, support email; scopes `email`, `profile`, `openid`) and publish it.
2. Create an OAuth client ID of type **Web application**. Add the hosted Supabase callback, `https://<project-ref>.supabase.co/auth/v1/callback`, as an authorised redirect URI.
3. In the hosted Supabase project, under Authentication › Providers › Google, enable Google and paste the client ID and secret. Add the frontend's `/projects` URL to the allowed redirect URLs (Authentication › URL Configuration) if it isn't there already.
4. Add Google Users to `ALLOWED_GOOGLE_IDS` as they send you the id from the not-allowed page.

To run the images locally against local Supabase:

```sh
docker run --rm -p 8080:8080 \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres \
  -e CORS_ALLOWED_ORIGINS=http://localhost:8081 sys-helper/backend
docker run --rm -p 8081:8080 sys-helper/frontend
```

## Documentation

| Doc | Holds |
| --- | --- |
| `CLAUDE.md` | Agent guidance: layout, commands, architecture, non-obvious constraints. |
| `CONTEXT.md` | Domain glossary (Project, Architecture, Component, Connection, Proposal, Requirement, Decision…). |
| `docs/backend.md` | Go packages, ownership scoping, locking and transaction hooks, endpoints, error codes, tables. |
| `docs/frontend.md` | Query keys and cache updates, workspace panes, canvas state, autosave, Proposal review, chat streaming, styling, test helpers. |
| `docs/ai.md` | The assistant turn, prompt, model clients and fallback, Proposal ops, accept flow. |
| `docs/recipes.md` | Checklist of every file to touch when adding a Component Type, connection kind, Proposal op, category or level, endpoint, table or UI component. |
| `docs/specs/`, `docs/adr/` | Feature specs and architecture decisions. |
