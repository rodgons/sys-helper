# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

Monorepo: Go API in `app/backend`, React SPA in `app/frontend`, Supabase local stack config in `supabase/`. The root is reserved for shared config (`Makefile`, `.env`, `biome.json`, pnpm workspace). Keep app code and scripts out of it. All workflows go through `make` (run `make` with no target to list them).

Product docs: `CONTEXT.md` is the domain glossary (use its terms in code and conversation), `docs/specs/` holds feature specs and `docs/adr/` holds architecture decisions.

## Commands

```sh
make setup / make dev                 # install deps; Supabase + API (Air) + Vite
make test                             # unit tests, both apps (no Supabase needed)
make test-integration / make test-e2e # need Supabase running (make supabase-start)
make test-all                         # lint + unit + integration + e2e
make lint / make format               # tsc + Biome + gofmt + go vet
make build                            # both prod Docker images
make db-migration name=x / make db-reset
```

Single tests:

```sh
cd app/backend && go test -run 'TestReady/database_down' ./internal/httpapi
cd app/backend && go test -tags integration -run TestConnect ./internal/database   # needs DATABASE_URL (make exports .env)
pnpm --filter frontend exec vitest run src/app.test.tsx -t 'shows unavailable'
pnpm --filter frontend exec playwright test e2e/smoke.spec.ts
```

## Architecture

- **Data flow:** the browser uses TanStack Query (`@tanstack/react-query`) to call the Go API (`src/lib/api.ts`, base URL `VITE_API_URL`). The API connects to Supabase Postgres directly with a pgx pool. The frontend also gets a `supabase-js` client (`src/lib/supabase.ts`) for Supabase features (auth, storage, realtime), but nothing uses it yet. The API allows browser calls from other origins only for those listed in `CORS_ALLOWED_ORIGINS`.
- **Auth:** the browser signs in with GitHub through Supabase Auth (`src/lib/auth.tsx`, `useAuth()`) and sends the access token as a bearer token (`apiFetch(path, { token })`). The API wraps protected routes in `requireUser` (`internal/httpapi/auth.go`). It verifies the token against Supabase's JWKS (`internal/auth`), reads the GitHub username from `auth.identities`, and applies `ALLOWED_GITHUB_USERS`. Never trust `user_metadata`, because users can edit it.
- **AI:** `internal/assistant` runs a turn. It builds the context (system prompt in `prompt.go`, the current Architecture, the last 30 Messages), streams from an `llm.ChatModel`, and saves the reply only when it completes. `POST /api/projects/{slug}/reply` streams it as SSE (`delta`, `done`, `error`), and the client retries by calling it again. Models: `llm.OpenAIClient` talks to NVIDIA's OpenAI-compatible API. The models come only from `.env`: `AI_MODEL` is required with a key, and `llm.Fallback` switches to `AI_FALLBACK_MODEL` when `AI_MODEL` hasn't started answering within `AI_FIRST_TOKEN_TIMEOUT`. `llm.Fake` (`AI_FAKE=1`) is used by E2E. `make test-ai-live` hits the real API with the configured models.
- **Frontend routing:** React Router in declarative mode (`<Routes>` in `src/root.tsx`, `BrowserRouter` in `main.tsx`).
- **Config:** a single root `.env` serves every app. Make loads and exports it (`-include .env` + `export`), and Vite reads it because `envDir: '../..'`. `VITE_*` values are compiled into the bundle at build time, so production values are passed as Docker build args (`make build-frontend VITE_API_URL=…`).
- **Backend wiring:** `cmd/server/main.go` is the only place real dependencies are built. Handlers in `internal/httpapi` depend on small interfaces (e.g. `Pinger`) passed in through `httpapi.Deps`, and `config.Load` takes an injected `getenv`. Tests supply fakes through these seams. Keep that pattern for new dependencies. Routes use Go 1.22+ `ServeMux` patterns (`"GET /path"`), with no router library.
- **Design system:** tokens live in `src/design/tokens.stylex.ts` (colors, space, type, radius, layout, `media` breakpoints). Their keys start with `--`, so StyleX emits them as literal CSS variables that `global.css` also uses. Base components are in `src/ui/`, and `/ui-kit` (`src/pages/ui-kit.tsx`) renders all of them. "Design system" means only these UI tokens and components; the architecture a User draws is an **Architecture** (see `CONTEXT.md`). Use token roles (`color['--color-fg']`), not raw values.
- **Tests:** follow test-first (red/green/refactor; README has the strategy).
  - **Go:** black-box `package x_test`. Integration tests live in `*_integration_test.go` files with `//go:build integration`.
  - **Frontend:** render with `renderWithQuery` from `src/test/render.tsx` (pass `{ route }` to start the MemoryRouter at a path) and stub network calls with `vi.stubGlobal('fetch', vi.fn(mockApi({ 'GET /api/projects': [...] })))`. Pass `auth: signedIn()` or `signedOut()` to set the session, and render `<LocationProbe />` to assert on navigation. Vitest gets fixed `VITE_*` values from `test.env` in `vite.config.ts`.
  - **Go integration:** `internal/testdb` gives you `Pool(t)` and `User(t, pool, githubUsername)`, which creates a Supabase user and removes it after the test.
  - **E2E:** Playwright starts the real API and Vite through `webServer`. Import `test` from `e2e/fixtures.ts`. Its `signIn()` fixture creates a GitHub-linked user and injects the session, because real GitHub OAuth can't run in tests.

## Non-obvious constraints (each one was a real bug)

- **StyleX under Vitest:** `vite.config.ts` uses `stylex.rollup()` in Vitest and `stylex.vite()` everywhere else. The Vite adapter leaves an interval running that Vitest never clears, so the test process hangs on exit. `stylex.create` must be compiled; there is no runtime fallback.
- **Signal-safe commands:** never launch long-running processes through `pnpm …`, `go run` or `go tool …` anywhere a signal must reach them (Playwright `webServer`, the `make dev` supervisor). Those wrappers leave the real process orphaned. Launch `./node_modules/.bin/vite` and the path from `go tool -n air` directly.
- **`make dev` supervisor:** this is the `DEV_SUPERVISOR` block in the Makefile, and it runs on macOS `/bin/bash` 3.2 (no `wait -n`, no associative arrays). Keep `DEV_STOP_TIMEOUT` (15s) above `kill_delay` in `app/backend/.air.toml` (12s), and the server's 10s shutdown timeout below both. On Ctrl-C it stops Supabase unless you pass `KEEP_SUPABASE=1`.
- **Pinned versions:** `@babel/core` stays on 7.x because `@stylexjs/unplugin`'s Babel plugins need it. Run `pnpm peers check` after upgrades.
- **Docker builds:**
  - **Frontend:** the build context is the **repo root**, because it needs the workspace lockfile. Its ignore file is `app/frontend/Dockerfile.dockerignore` (there is no root `.dockerignore`).
  - **Backend:** the build context is `app/backend`.
  - **Final images:** keep them minimal. The backend runs on `scratch` and the frontend on `static-web-server`, both as non-root users on port 8080.
- **Biome config:** `biome.json` uses `"preset": "recommended"`. `biome migrate` rewrote it to `"none"` once, which silently disabled the lint rules.
- **Supabase CLI:** use the pnpm devDependency at the root (`pnpm exec supabase`). There is no global install. Local keys in `.env.example` are the CLI's public demo defaults.
