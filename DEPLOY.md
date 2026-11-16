# Deploying FleetGo on Railway

FleetGo ships as a **single web service** that serves both the REST API and the
built React SPA from the same origin (no CORS / cross-site cookie issues), plus
a **PostgreSQL** database. The repo includes a `Dockerfile` and `railway.json`,
so Railway builds and runs it with no extra configuration.

## 1. Create the project

1. Push this repo to GitHub (already done if you're reading this there).
2. In Railway: **New Project → Deploy from GitHub repo →** select
   `harikeerthijsan/JSAN_FleetGo`.
3. Railway detects the `Dockerfile` and `railway.json` automatically.

## 2. Add PostgreSQL

In the project: **New → Database → PostgreSQL**. This creates a `DATABASE_URL`.

## 3. Set service variables

On the FleetGo service → **Variables**:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` (reference the Postgres plugin) |
| `JWT_ACCESS_SECRET` | a 32+ char random string (`openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | a different 32+ char random string |
| `NODE_ENV` | `production` |
| `COOKIE_SAMESITE` | `lax` |

`PORT` is injected by Railway automatically — do **not** set it. See
`.env.example` for the full list and optional variables.

## 4. Deploy

Railway builds the Docker image and starts the service. On boot the container
runs `prisma migrate deploy` (applies all migrations), then starts the server.
The healthcheck is `GET /api/v1/health`.

## 5. One-time data setup (seed + role permissions)

The migrations create the schema but no data. Run the setup script **once** after
the first successful deploy — from the service shell (Railway → service →
**Settings → Deploy → Run command**, or the Railway CLI `railway run`):

```bash
cd backend && npm run setup:all
```

`setup:all` applies migrations, seeds roles/users/depots/sample data, and grants
every module's permissions (inventory, operations, tracking, inspections, disk,
vendors, settings). It is safe to re-run (idempotent upserts).

Development login accounts created by the seed (password `FleetGo123`):
`superadmin@fleetgo.dev`, `jsanadmin@fleetgo.dev`, `opsmanager@fleetgo.dev`,
`ctsuser@fleetgo.dev`, `vendor1@fleetgo.dev`, `vendor2@fleetgo.dev`,
`driver@fleetgo.dev`. **Change these before any real use.**

## 6. Open the app

Railway gives the service a public domain (**Settings → Networking → Generate
Domain**). Open it — the SPA loads and talks to the API at the same origin.

## Notes & limitations

- **Uploads are ephemeral.** Vendor documents and ticket photos/videos are
  written to the container filesystem, which Railway resets on each deploy.
  For durable files, attach a **Railway Volume** and point `STORAGE_LOCAL_PATH`
  at its mount (e.g. `/data/storage`), or wire an object-storage driver. All
  file *metadata* lives in PostgreSQL and is safe.
- **Secrets:** never commit real `JWT_*` secrets or `DATABASE_URL`; set them only
  in Railway. `.env` is git-ignored.
- **GPS tracking** uses simulated data unless a real provider is configured.
- Local development is unchanged: run Postgres, `backend` (`npm run dev`) and
  `frontend` (`npm run dev`) separately; the Vite dev server proxies `/api`.
