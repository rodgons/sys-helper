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

# Security headers for every response. The CSP lets the page talk only to itself, the API and
# Supabase, and load images only from itself and GitHub avatars (chat markdown never loads remote
# images). Inline styles are allowed because React Flow positions elements with style attributes.
RUN test -n "$VITE_API_URL" && test -n "$VITE_SUPABASE_URL" && \
    printf '%s\n' \
      '[advanced]' \
      '[[advanced.headers]]' \
      'source = "**"' \
      '[advanced.headers.headers]' \
      "Content-Security-Policy = \"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.githubusercontent.com https://lh3.googleusercontent.com; font-src 'self'; connect-src 'self' ${VITE_API_URL} ${VITE_SUPABASE_URL}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'\"" \
      'X-Frame-Options = "DENY"' \
      'X-Content-Type-Options = "nosniff"' \
      'Referrer-Policy = "strict-origin-when-cross-origin"' \
      > /repo/sws.toml

# static-web-server: tiny static (scratch-based) Rust file server.
FROM joseluisq/static-web-server:2
COPY --from=build /repo/app/frontend/dist /public
COPY --from=build /repo/sws.toml /sws.toml
ENV SERVER_ROOT=/public \
    SERVER_CONFIG_FILE=/sws.toml \
    SERVER_SECURITY_HEADERS=true \
    SERVER_PORT=8080 \
    SERVER_FALLBACK_PAGE=/public/index.html \
    SERVER_COMPRESSION=true \
    SERVER_HEALTH=true
USER 65534:65534
EXPOSE 8080
