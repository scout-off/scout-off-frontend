# Pinned to node:24-alpine to match the frontend's runtime (.nvmrc is 24,
# package.json requires node >=24). Issue #1520 — this had drifted to
# node:20 while the project moved to 24.
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/dist ./dist

EXPOSE 3001

# /health returns 503 once the indexer is unhealthy (see server.ts).
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD wget --spider -q http://localhost:3001/health || exit 1

# server.ts drains the in-flight poll batch on SIGTERM (10 s cap).
STOPSIGNAL SIGTERM

CMD ["node", "dist/index.js"]
