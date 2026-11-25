# Builds and serves the Next.js frontend for the Docker Compose dev stack.
#
# NEXT_PUBLIC_* variables are inlined into the client JS bundle at build
# time, so they're passed as build ARGs (not just runtime env) — see
# docker-compose.yml, which supplies values pointing at the mock RPC/API
# services so the browser can reach them directly (mapped to localhost).
#
# Pinned to node:24-alpine to match the runtime required by package.json
# (`"engines": { "node": ">=24" }`) and `.nvmrc` (24). Issue #1520 — the
# Dockerfiles had drifted to node:20 while the project moved to 24, so
# `npm ci` / `npm run build` silently ran on the wrong runtime in Docker
# even though CI's setup-node step used 24.
FROM node:24-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
# CI=true skips the `prepare` script's `husky install` — there's no .git
# directory in the build context, so that would otherwise fail the build.
RUN CI=true npm ci

FROM node:24-alpine AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_CONTRACT_ID
ARG NEXT_PUBLIC_NETWORK
ARG NEXT_PUBLIC_HORIZON_URL
ARG NEXT_PUBLIC_SOROBAN_RPC
ARG NEXT_PUBLIC_IPFS_GATEWAY
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ADMIN_ADDRESS
ARG NEXT_PUBLIC_DOMAIN
ARG NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_CONTRACT_ID=$NEXT_PUBLIC_CONTRACT_ID \
    NEXT_PUBLIC_NETWORK=$NEXT_PUBLIC_NETWORK \
    NEXT_PUBLIC_HORIZON_URL=$NEXT_PUBLIC_HORIZON_URL \
    NEXT_PUBLIC_SOROBAN_RPC=$NEXT_PUBLIC_SOROBAN_RPC \
    NEXT_PUBLIC_IPFS_GATEWAY=$NEXT_PUBLIC_IPFS_GATEWAY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_ADMIN_ADDRESS=$NEXT_PUBLIC_ADMIN_ADDRESS \
    NEXT_PUBLIC_DOMAIN=$NEXT_PUBLIC_DOMAIN \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    CI=true \
    NODE_ENV=production

RUN npm run build

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# tini as PID 1 forwards SIGTERM to node so the server shuts down gracefully.
RUN apk add --no-cache tini

# Standalone output (next.config.js `output: 'standalone'`) bundles only the
# traced runtime dependencies, so the full node_modules isn't copied. The
# sitemap config is only used by `postbuild`, so it isn't needed at runtime.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# SQLite stores default to /app/data (lib/sqliteDb.ts); make it writable by
# the unprivileged runtime user.
RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 3000

STOPSIGNAL SIGTERM

# Process-only liveness check — see app/api/healthz/route.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3000/api/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
