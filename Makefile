SHELL := /bin/bash
.DEFAULT_GOAL := help

-include .env
export

BACKEND_DIR  := app/backend
FRONTEND_DIR := app/frontend
SUPABASE     := pnpm exec supabase
FE           := pnpm --filter frontend

IMAGE_PREFIX ?= sys-helper
TAG          ?= latest

##@ Setup
.PHONY: help setup env

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2} /^##@/ {printf "\n\033[1m%s\033[0m\n", substr($$0, 5)}' $(MAKEFILE_LIST)

setup: env ## Install all dependencies (Node, Go, Playwright browser)
	pnpm install
	cd $(BACKEND_DIR) && go mod download
	$(FE) exec playwright install chromium

env: ## Create .env from .env.example if missing
	@test -f .env || (cp .env.example .env && echo "created .env")

##@ Development
.PHONY: dev dev-backend dev-frontend

DEV_STOP_TIMEOUT ?= 15

# Supervises Air (Go live reload) and Vite as direct children (no `go tool`/`pnpm`
# wrappers, which orphan the real process on SIGTERM). On Ctrl-C, or if either process
# exits, it sends SIGTERM to both, waits up to DEV_STOP_TIMEOUT seconds before SIGKILL,
# then stops Supabase (data is kept). Use KEEP_SUPABASE=1 to leave Supabase running.
# Keep DEV_STOP_TIMEOUT above kill_delay in app/backend/.air.toml.
define DEV_SUPERVISOR
be=; fe=; status=0
air=$$(cd $(BACKEND_DIR) && go tool -n air) || exit 1
alive() { for p in "$$@"; do kill -0 "$$p" 2>/dev/null && return 0; done; return 1; }
stop() {
  trap '' INT TERM
  echo; echo "==> Stopping backend and frontend..."
  kill -TERM $$be $$fe 2>/dev/null
  for _ in $$(seq $(DEV_STOP_TIMEOUT)); do alive $$be $$fe || break; sleep 1; done
  if alive $$be $$fe; then echo "==> Timed out, forcing kill"; kill -KILL $$be $$fe 2>/dev/null; fi
  wait 2>/dev/null
  if [ -z "$(KEEP_SUPABASE)" ]; then echo "==> Stopping Supabase..."; $(SUPABASE) stop; fi
  echo "==> Dev environment stopped."
  exit $$status
}
trap stop INT TERM
(cd $(BACKEND_DIR) && exec "$$air") & be=$$!
(cd $(FRONTEND_DIR) && exec ./node_modules/.bin/vite) & fe=$$!
while kill -0 $$be 2>/dev/null && kill -0 $$fe 2>/dev/null; do sleep 1; done
echo "==> A dev process exited unexpectedly"; status=1
stop
endef
export DEV_SUPERVISOR

dev: supabase-start ## Start Supabase, API (Air live reload) and Vite; Ctrl-C stops all
	@bash -c "$$DEV_SUPERVISOR"

dev-backend: ## Run the Go API on :8080 with Air live reload
	cd $(BACKEND_DIR) && go tool air

dev-frontend: ## Run the Vite dev server on :5173
	$(FE) dev

##@ Supabase
.PHONY: supabase-start supabase-stop supabase-status db-reset db-migration

supabase-start: ## Start local Supabase (Docker)
	$(SUPABASE) start

supabase-stop: ## Stop local Supabase
	$(SUPABASE) stop

supabase-status: ## Show local Supabase URLs and keys
	$(SUPABASE) status

db-reset: ## Recreate local DB, apply migrations and seed
	$(SUPABASE) db reset

db-migration: ## Create a migration: make db-migration name=create_users
	@test -n "$(name)" || (echo "usage: make db-migration name=<name>" && exit 1)
	$(SUPABASE) migration new $(name)

##@ Testing (TDD)
.PHONY: test test-backend test-frontend test-watch-backend test-watch-frontend test-integration test-e2e test-all coverage

test: test-backend test-frontend ## Fast unit tests for both apps (no external deps)

test-backend: ## Go unit tests
	cd $(BACKEND_DIR) && go tool gotestsum --format testname -- -race ./...

test-frontend: ## Vitest unit/component tests
	$(FE) test

test-watch-backend: ## Re-run Go tests on change (red-green loop)
	cd $(BACKEND_DIR) && go tool gotestsum --format testname --watch

test-watch-frontend: ## Vitest watch mode (red-green loop)
	$(FE) test:watch

test-integration: ## Go integration tests against local Supabase Postgres
	cd $(BACKEND_DIR) && go tool gotestsum --format testname -- -race -tags integration ./...

test-e2e: ## Playwright full-stack tests (needs Supabase running)
	$(FE) test:e2e

test-all: lint test test-integration test-e2e ## Everything CI should run

coverage: ## Coverage reports for both apps
	cd $(BACKEND_DIR) && go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out | tail -1
	$(FE) test:coverage

##@ Quality
.PHONY: lint format typecheck

lint: typecheck ## Lint both apps
	pnpm exec biome check .
	cd $(BACKEND_DIR) && test -z "$$(gofmt -l .)" || (gofmt -l . && exit 1)
	cd $(BACKEND_DIR) && go vet ./... && go vet -tags integration ./...

format: ## Format both apps
	pnpm exec biome check --write .
	cd $(BACKEND_DIR) && gofmt -w .

typecheck: ## TypeScript type check
	$(FE) typecheck

##@ Build
.PHONY: build build-backend build-frontend clean

build: build-backend build-frontend ## Build both Docker images
	@docker images --filter "reference=$(IMAGE_PREFIX)/*:$(TAG)" --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}"

build-backend: ## Build the backend image
	docker build -t $(IMAGE_PREFIX)/backend:$(TAG) $(BACKEND_DIR)

build-frontend: ## Build the frontend image (VITE_* are baked in)
	docker build -t $(IMAGE_PREFIX)/frontend:$(TAG) -f $(FRONTEND_DIR)/Dockerfile \
		--build-arg VITE_API_URL=$(VITE_API_URL) \
		--build-arg VITE_SUPABASE_URL=$(VITE_SUPABASE_URL) \
		--build-arg VITE_SUPABASE_PUBLISHABLE_KEY=$(VITE_SUPABASE_PUBLISHABLE_KEY) \
		.

clean: ## Remove build and test artifacts
	rm -rf $(FRONTEND_DIR)/dist $(FRONTEND_DIR)/test-results $(FRONTEND_DIR)/playwright-report $(BACKEND_DIR)/coverage.out
