# One Railway web service: same-origin SPA, API and tracking WebSocket.
FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --include=dev
COPY frontend/ ./
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build

FROM node:22-bookworm-slim AS backend
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
RUN npm ci --include=dev
COPY backend/src ./src
COPY backend/tsconfig.json ./
RUN npm run prisma:generate && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini gosu && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
ENV NODE_ENV=production LOG_LEVEL=info FRONTEND_DIST=/app/frontend/dist STORAGE_DRIVER=local STORAGE_LOCAL_PATH=/data/storage TRACKING_SIMULATION_ENABLED=false
COPY --from=backend /app/backend/node_modules ./node_modules
COPY --from=backend /app/backend/package.json ./package.json
COPY --from=backend /app/backend/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=backend /app/backend/prisma/migrations ./prisma/migrations
COPY --from=backend /app/backend/dist ./dist
COPY --from=frontend /app/frontend/dist /app/frontend/dist
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/fleetgo-entrypoint
EXPOSE 4000
# Railway runs production:release as pre-deploy, not on container restarts.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/fleetgo-entrypoint"]
CMD ["node", "dist/server.js"]
