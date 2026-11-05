# FleetGo — single-service image for Railway (and any Docker host).
# Builds the React frontend and the Node/Prisma backend, then runs one service
# that serves the API and the built SPA from the same origin.

# ---- 1. Build the frontend (Vite → static files) --------------------------
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Build the backend (TypeScript → dist, Prisma client) --------------
FROM node:20-slim AS backend
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npm run build

# ---- 3. Runtime -----------------------------------------------------------
FROM node:20-slim AS runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
ENV NODE_ENV=production
# Full install so the Prisma CLI and tsx are available for `migrate deploy` and
# the one-time seed/enable setup scripts.
COPY backend/package*.json ./
RUN npm ci
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY --from=backend /app/backend/dist ./dist
# Built SPA, served by the backend (see app.ts / FRONTEND_DIST).
COPY --from=frontend /app/frontend/dist /app/frontend/dist
ENV FRONTEND_DIST=/app/frontend/dist
# Railway injects PORT; the app reads it (defaults to 4000 locally).
EXPOSE 4000
# Apply migrations on boot, then start the server. (Seeding/role-enablement is a
# separate one-time step — see DEPLOY.md.)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
