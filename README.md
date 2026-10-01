# sys-helper

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

## Database

```sh
make db-migration name=create_profiles   # new file in supabase/migrations
make db-reset                            # re-apply all migrations + supabase/seed.sql
```

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

`make test-all` runs lint, unit, integration and E2E. That's what CI should run.

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
- **frontend:** the Vite build served by `static-web-server` with SPA fallback, compression and `/health`, running as a non-root user on port 8080 (~11 MB). Pass the production `VITE_*` values at build time:

  ```sh
  make build-frontend VITE_API_URL=https://api.example.com VITE_SUPABASE_URL=… VITE_SUPABASE_PUBLISHABLE_KEY=…
  ```

To run the images locally against local Supabase:

```sh
docker run --rm -p 8080:8080 \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres \
  -e CORS_ALLOWED_ORIGINS=http://localhost:8081 sys-helper/backend
docker run --rm -p 8081:8080 sys-helper/frontend
```
