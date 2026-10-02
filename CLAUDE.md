# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

Monorepo: Go API in `app/backend`, React SPA in `app/frontend`, Supabase local stack config in `supabase/`. The root is reserved for shared config (`Makefile`, `.env`, `biome.json`, pnpm workspace). Keep app code and scripts out of it. All workflows go through `make` (run `make` with no target to list them).

## Docs

Read the matching doc before changing that area. These are plain paths: open them with Read when the task touches them.

- `CONTEXT.md`: domain glossary. Use its terms (Project, Architecture, Component, Connection, Proposal, Requirement, Decision…) in code and conversation.
- `docs/backend.md`: Go packages, ownership scoping, locking and transaction hooks, endpoints, error codes, tables and migration rules.
- `docs/ai.md`: the assistant turn, prompt, model clients and fallback, Proposal ops, validation, accept flow.
- `docs/frontend.md`: query keys and cache updates, workspace panes, canvas state, autosave, Proposal review, chat streaming, styling, test helpers.
- `docs/recipes.md`: checklist of every file to touch when adding a Component Type, connection kind, Proposal op, category or level, endpoint, table or UI component. Read it first for any of those.
- `docs/specs/` (feature specs) and `docs/adr/` (architecture decisions): background for why things are the way they are.

## Commands

```sh
make setup / make dev                 # install deps; Supabase + API (Air) + Vite
make test                             # unit tests, both apps (no Supabase needed)
make test-integration / make test-e2e # need Supabase running (make supabase-start)
make test-all                         # lint + unit + integration + e2e
make lint / make format               # tsc + Biome + gofmt + go vet
make build                            # both prod Docker images
make db-migration name=x / make db-reset
make demo-screenshots                 # recapture the home page's workspace images (needs Supabase)
```

Single tests:

```sh
cd app/backend && go test -run 'TestReady/database_down' ./internal/httpapi
cd app/backend && go test -tags integration -run TestConnect ./internal/database   # needs DATABASE_URL (make exports .env)
pnpm --filter frontend exec vitest run src/pages/home.test.tsx -t 'sends signed-in users'
pnpm --filter frontend exec playwright test e2e/smoke.spec.ts
```

## Architecture

- **Data flow:** the browser calls the Go API through TanStack Query hooks in `src/lib/` (`apiFetch`, base URL `VITE_API_URL`). The API talks to Supabase Postgres directly with a pgx pool; nothing uses supabase-js except auth. Cross-origin calls are allowed only from `CORS_ALLOWED_ORIGINS`.
- **Auth:** GitHub or Google sign-in through Supabase Auth (`src/lib/auth.tsx`, `useAuth()`, `signIn(provider)`). A second provider with the same verified email links to the same User (Supabase automatic linking). The access token goes as a bearer token. `requireUser` (`internal/httpapi/auth.go`) verifies it against Supabase's JWKS, reads the User's GitHub and Google identities from `auth.identities` and admits the User if any identity is listed in `ALLOWED_GITHUB_IDS` (numeric GitHub ids) or `ALLOWED_GOOGLE_IDS` (Google subs, never emails). Both empty admit nobody unless `ALLOW_ALL_USERS=1`. Never trust `user_metadata`, because users can edit it. Local Google sign-in needs `skip_nonce_check = true` in `supabase/config.toml`.
- **Ownership:** every store query is scoped to the User and the Project's slug suffix. Another User's Project is a 404, never a 403.
- **AI:** the AI changes the canvas and knowledge only through Proposals (the `propose_changes` tool), which the User accepts or rejects as a whole. Models come only from `.env` (`AI_PROVIDER`, `AI_MODEL`, `AI_FALLBACK_MODEL`). `AI_FAKE=1` gives a canned model for E2E and offline work.
- **Canvas ↔ server:** the canvas owns the Architecture document while open and autosaves it with a base version (409 on conflict). Accepting a Proposal applies it on the client and saves it in the same transaction that resolves it. Canvas saves prune Decisions whose targets are gone.
- **Duplicated catalogs:** Component Types, connection kinds, Requirement categories, Experience Levels, Proposal ops and accepted-item ids (`p{seq}-{ref}`) exist in both Go and TypeScript, and the enums also exist in SQL checks. Change them together (`docs/recipes.md`).
- **Frontend routing:** React Router in declarative mode (`<Routes>` in `src/root.tsx`, `BrowserRouter` in `main.tsx`).
- **Config:** one root `.env` serves every app. Make exports it (`-include .env` + `export`), and Vite reads it via `envDir: '../..'`. `VITE_*` values are compiled in at build time, so production values are Docker build args (`make build-frontend VITE_API_URL=…`).
- **Backend wiring:** `cmd/server/main.go` is the only place real dependencies are built. Handlers in `internal/httpapi` depend on small interfaces passed through `httpapi.Deps`, and `config.Load` takes an injected `getenv`. Tests supply fakes through these seams. Keep that pattern. Routes use Go 1.22+ `ServeMux` patterns, with no router library.
- **Design system:** this term means only the UI tokens (`src/design/tokens.stylex.ts`) and base components (`src/ui/`, all shown on `/ui-kit`). What a User draws is an **Architecture**. Use token roles (`color['--color-fg']`), not raw values.
- **Tests:** test-first (red/green/refactor; README has the strategy).
  - **Go:** black-box `package x_test`. Integration tests live in `*_integration_test.go` with `//go:build integration` and use `internal/testdb` (`Pool(t)`, `User(t, pool, githubUsername, testdb.WithGoogle(name)…)`).
  - **Frontend:** `renderWithQuery` + `mockApi` + `signedIn()` from `src/test/render.tsx`. Stub fetch with `vi.stubGlobal('fetch', vi.fn(mockApi({...})))`.
  - **E2E:** import `test` from `e2e/fixtures.ts`; its `signIn({ provider })` fixture creates a GitHub- or Google-linked user, because real OAuth can't run in tests.

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
- **Reply timeouts:** `/reply` clears the server's `WriteTimeout` per request, and `OpenAIClient` must not set an `http.Client.Timeout`. Replies stream longer than both, so they are bounded by the request context.
