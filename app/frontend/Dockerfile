# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# (The Supabase publishable key is public by design: it ships in the JS bundle.)
# Build context: repository root (needs the pnpm workspace lockfile).

FROM node:24-alpine AS build
RUN npm install -g pnpm@12.6.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/frontend/package.json app/frontend/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter frontend
COPY app/frontend app/frontend

# Vite inlines VITE_* at build time.
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
RUN pnpm --filter frontend build

# static-web-server: tiny static (scratch-based) Rust file server.
FROM joseluisq/static-web-server:2
COPY --from=build /repo/app/frontend/dist /public
ENV SERVER_ROOT=/public \
    SERVER_PORT=8080 \
    SERVER_FALLBACK_PAGE=/public/index.html \
    SERVER_COMPRESSION=true \
    SERVER_HEALTH=true
USER 65534:65534
EXPOSE 8080
