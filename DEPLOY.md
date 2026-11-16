# Hosting FleetGo on Railway

Use **one web service** built from the repository root, one Railway PostgreSQL service and one persistent upload volume. The web service serves the SPA, API and native tracking WebSocket on the same HTTPS domain. Do not deploy the frontend as a second service for this configuration.

## 1. Prepare the service before its first deployment

1. Create a Railway project with PostgreSQL and an empty web service. Use the production branch/repository you intend to release.
2. Attach a persistent **Volume at /data** to the web service. Uploaded claim evidence, dispatch/inspection photos, vendor documents and other files live under /data/storage. PostgreSQL holds only metadata.
3. Generate the web service's public domain. Set APP_PUBLIC_URL to its exact HTTPS origin without a trailing slash, or allow the automatic RAILWAY_PUBLIC_DOMAIN fallback. An explicit CORS_ORIGINS list must contain only your exact HTTPS frontend origins.
4. Add the variables below. Attach the GitHub source after variables and the volume are configured. Keep the service root directory at the repository root; Railway reads the committed Dockerfile and railway.json. Do not set a custom build/start command or a fixed PORT.

| Variable | Value |
| --- | --- |
| DATABASE_URL | ${{Postgres.DATABASE_URL}} (adjust the service name if needed) |
| JWT_ACCESS_SECRET | Independently generated random secret, at least 32 characters |
| JWT_REFRESH_SECRET | A different independently generated random secret |
| NODE_ENV | production |
| APP_PUBLIC_URL | https://YOUR-SERVICE.up.railway.app |
| STORAGE_DRIVER | local |
| STORAGE_LOCAL_PATH | /data/storage |
| COOKIE_SECURE | true |
| COOKIE_SAMESITE | lax |
| TRUST_PROXY_HOPS | 1 for the Railway edge in front of this service |
| TRACKING_WS_ENABLED | true |
| TRACKING_SIMULATION_ENABLED | false |
| LOG_LEVEL | info |
| BOOTSTRAP_ADMIN_EMAIL | Your real initial administrator address, first deployment only |
| BOOTSTRAP_ADMIN_NAME | Initial administrator's display name |
| BOOTSTRAP_ADMIN_PASSWORD | Unique password, 14-72 characters/maximum 72 UTF-8 bytes, including uppercase, lowercase and a number |

Generate secrets locally without pasting them into source code, for example with Node's crypto.randomBytes(32).toString('hex'). Railway injects PORT; the process listens on 0.0.0.0. Leave API_PREFIX at /api/v1 because the image, frontend and healthcheck use this route. Root .env.example is the deployment variable reference; no .env file is copied into the image.

Keep **one replica** with this volume-backed storage design. Railway's [volume constraints](https://docs.railway.com/volumes/reference#caveats) include single-service volume attachment and brief downtime on replacement. Horizontal scaling needs a separately implemented shared object-storage provider and distributed rate limiting; selecting s3/gcs currently fails production validation rather than silently storing files on ephemeral disk.

## 2. What happens during deployment

The Docker build uses Node 22 and locked npm dependencies, compiles frontend/backend and prunes backend development dependencies. The runtime contains compiled code, the built SPA, Prisma migration tooling and migrations; it omits the demo seed and TypeScript compiler. The entrypoint prepares /data/storage and drops the application to UID 1000. It never recursively changes ownership of an existing volume.

Railway's pre-deploy command is npm run production:release from /app/backend. It runs **prisma migrate deploy**, then the compiled production bootstrap. Any failure blocks deployment. [Pre-deploy jobs](https://docs.railway.com/deployments/pre-deploy-command) do not require the upload volume; this bootstrap only uses PostgreSQL.

The bootstrap is transactional and repeatable. It installs missing system permissions, role defaults, ticket types/SLA/workflows, settings and tracking policy. It creates the explicitly configured Super Admin only if no active Super Admin exists. It never resets existing passwords, wipes data, replaces configured workflows or creates demo users/vehicles/depots/organizations/GPS providers. Existing role customizations remain, except Super Admin retains the complete permission catalog and newly introduced permissions receive catalog defaults.

After the initial successful deployment, remove BOOTSTRAP_ADMIN_PASSWORD and the other bootstrap variables. Future releases retain the administrator account. A lost administrator password is an explicit account-recovery operation; changing bootstrap variables never resets an existing account.

The process fails startup on unavailable database/storage or an invalid production configuration. GET /api/v1/health reports database connectivity and upload writability and returns 503 on dependency failure. Railway uses this path with a 180-second deployment healthcheck. Also configure an external uptime monitor for ongoing checks; a deployment healthcheck alone is not continuous monitoring.

## 3. Existing databases and files

Before the first production deployment of an existing installation:

- Back up PostgreSQL and the upload directory. Restore-test backups separately, then stage the release against a restored database.
- Rotate passwords or deactivate any development accounts still using the known demo password. The production bootstrap blocks active @fleetgo.dev demo accounts with that password; it does not automatically alter accounts.
- Copy existing uploaded bytes into the attached volume while retaining their relative storage keys. A new empty volume does not recover old uploads whose metadata already exists in PostgreSQL.
- Ensure existing subdirectories/files are readable and writable by UID/GID 1000. The startup script initializes only /data/storage; it intentionally does not recursively chown your existing files. Perform an explicit controlled ownership migration when importing old root-owned storage.
- Review the default role grants, assign real organizations/depots, configure approval actors, support contact and production GPS provider mappings through the app.

Do not run db:seed, setup:all or enable:all against production. The development seed is explicitly blocked when NODE_ENV=production. Use production:release for migrations and safe initialization instead. Container restarts run only the server, not migrations or seed scripts.

To rerun release/bootstrap manually, execute npm run production:release in the deployed container through an authenticated Railway service shell/SSH; the image's working directory is already /app/backend. Do not prefix cd backend. A local railway run uses local code/environment and is not the same as executing inside the deployed container.

## 4. Password recovery and operational setup

For self-service recovery configure:

| Variable | Example |
| --- | --- |
| SMTP_HOST | smtp.your-provider.example |
| SMTP_PORT | 587 for STARTTLS, or 465 with SMTP_SECURE=true |
| SMTP_SECURE | false for required STARTTLS; true for implicit TLS |
| SMTP_USER / SMTP_PASSWORD | Your backend SMTP credentials, both or neither |
| MAIL_FROM | A verified sender address |

APP_PUBLIC_URL (or the Railway domain fallback) supplies the reset link origin. Delivery uses TLS, bounded connection timeouts and a text email containing the expiring token; tokens are never returned in production API responses or printed in mail logs. Without SMTP, password recovery reports unavailable. With configured SMTP, public responses do not disclose whether an account exists; delivery failures are logged for operators. Verify real delivery with your provider before onboarding users.

SMTP credentials and GPS provider credentials are **server-only**. No VITE_ variable may contain a secret. The image fixes the frontend API base to /api/v1. Tracking WebSockets use the same public origin and require an allowed Origin and an authenticated first message. Simulation is off by default in the production image.

The built app has a production CSP, secure cookies, bounded trusted proxy hops, exact-origin CORS, sanitized server errors, immutable hashed-asset caching and uncached SPA HTML. If you add an external resource later, update the CSP deliberately. Existing upload/download authorization remains in each business module.

Configure PostgreSQL and volume backups separately, retention and restore testing, log/uptime alerts, database/storage capacity monitoring, and alert recipients. Keep deployment secrets out of logs and source control. Use a migration-compatible rollback; redeploying an earlier image does not reverse database migrations. Never use prisma migrate reset or db push for production releases.

## 5. Verification

Local reproduction (Docker must be running):

    docker build -t fleetgo:production-check .
    npm --prefix backend ci
    npm --prefix backend run test:production

The production test creates a uniquely named isolated Docker PostgreSQL database/network/upload volume and removes only those test resources afterward. It never connects to the normal local database. It exercises fresh migrations, repeatable initialization/password preservation, absence of demo data, production configuration, secure authentication/cookies, SPA assets/deep links, API smoke checks, WebSocket authentication, storage path safety, upload survival after restart/replacement, XLSX compatibility and SMTP message construction. No real provider emails or live Railway resources are used.

The GitHub Actions production workflow repeats dependency audit, map checks, Docker build and isolated integration checks. Set the workflow as a required branch check before enabling Railway autodeploys if your repository policy requires it.

After deployment verify /api/v1/health, login/refresh/logout, a nested app route on browser refresh, a real authorized upload/download, tracking WebSocket connection and SMTP delivery. Redeploy once and confirm the same evidence remains accessible. The Railway volume and public domain must be configured in Railway; repository files cannot provision those resources by themselves.

See docs/RAILWAY_READINESS.md for recorded local verification and remaining deployment-specific steps.
