# Railway production readiness - 2026-11-16

The repository is prepared for a single Railway web service, PostgreSQL and an upload volume. This work is local only: no Railway service/database/volume/domain was created, no deployment was triggered, and no commit or push was performed.

## Changes

- Replaced the old Node 20 image and automatic demo seeding with a Node 22 multi-stage image. Runtime includes compiled backend, SPA and pinned Prisma tooling; demo seed, TypeScript compiler, local secrets and test data are excluded. Tini forwards signals and the application drops to UID/GID 1000 after initializing the volume directory.
- Added Railway pre-deploy production:release, combining migrations and a transactional advisory-locked bootstrap. Explicit administrator credentials are required for a new database. Repeated releases retain existing passwords, users, configured defaults and workflows; production does not fabricate vehicles, organizations, depots or GPS coordinates. Active seeded accounts with the known demo password block bootstrap.
- Required secure production configuration: independent JWT secrets, public HTTPS origins, secure cookies, supported storage and an absolute upload path. Railway startup checks that storage is inside the mounted volume, writable and backed by a reachable database. Health reports database and storage readiness. Missing dependencies stop production startup.
- Enabled a production Content Security Policy, exact-origin CORS, bounded proxy trust, private server error responses, query-free access logs, immutable hashed assets and uncached SPA HTML. Fixed storage-key sibling-prefix traversal. Kept authorized downloads in the existing business modules.
- Added TLS SMTP reset-email delivery with a configured public origin and no production devToken response. Without SMTP, recovery explicitly reports unavailable. A configured provider's real delivery still needs acceptance testing.
- Upgraded Zod and React Router to patched releases and applied an ExcelJS-scoped UUID override. Audits report zero vulnerabilities in shipped backend/frontend dependencies. Added a typed PATCH compatibility helper so omitted create-time defaults/transforms do not overwrite existing fields after the Zod upgrade.
- Added isolated production Docker tests, GitHub Actions build/audit checks, production environment examples and a complete Railway deployment/backup/recovery guide.

## Verification

**43 production-container checks passed.** The final output is recorded in [railway-production-results.txt](railway-production-results.txt). The suite uses an isolated temporary PostgreSQL container/network/volume and removes those test resources on completion; it never migrates or seeds the normal local database. It validates fresh migrations, admin initialization and repeated release, absent demo data/compiler, non-root app process, secure cookies and refresh, CSP/caching/static/deep-link behavior, validation, authentication, production module endpoints, exact-origin CORS, native WebSockets, disabled simulation, durable evidence across restart and replacement, path traversal protection, XLSX compatibility, sanitized errors, SMTP construction and failure without a Railway upload mount.

Additional checks:

- Frontend production build passed, including the patched router. Existing bundle-size and mixed-import advisories remain.
- Backend Linux production build passed in Docker.
- Required-claims regression: 59 assertions passed, using mocked database/storage.
- Currency validation, persistence, audit and grouped totals: passed using mocks.
- Vehicle registration/inventory regression: 43 assertions passed; every test transaction was rolled back, with no retained records.
- Leaflet movement/provenance/empty-state component suite: 10 assertions passed.
- Backend/frontend runtime npm audit: zero vulnerabilities at verification time.
- Git diff whitespace check passed.

The old image initially exposed the demo seed file even though automatic seeding was removed. The runtime manifest now copies only the Prisma schema/migrations, and the test verifies the seed is absent. Integration testing also caught a test harness assumption about random Docker host ports changing on restart; it now discovers the port again before checking persisted uploads.

## Deployment-specific work

Follow ../DEPLOY.md. In Railway configure the repository root, private PostgreSQL reference, /data upload volume, public HTTPS origin, independent JWT secrets and initial administrator before deployment. Remove bootstrap credentials after setup. Configure SMTP and verify real password-reset delivery if recovery is needed; configure real GPS separately.

For an existing database, stage/backup/restore-test first, rotate or deactivate known-password demo accounts, copy existing evidence bytes with their original storage keys, and ensure imported directories are writable by UID 1000. An empty volume cannot reconstruct previous files from metadata.

Choose one replica with this volume-backed design. Multi-replica hosting needs a separate shared object-storage implementation and distributed rate limiting. This change does not add those integrations. Real browser visual/mobile acceptance, live Railway HTTPS/cookie checks, real upload/download after redeploy and actual SMTP/GPS provider acceptance remain deployment checks.

## Files

Deployment: Dockerfile, railway.json, scripts/docker-entrypoint.sh, .dockerignore, .gitattributes, .github/workflows/production.yml, root/backend environment examples, DEPLOY.md, README.md, codex.md.

Backend: production bootstrap under src/scripts; config/env and config/index; app/server; health service/types; authentication/mail; error/access-log middleware; storage provider/readiness; PATCH helper and affected request validators/master-data parser; package manifests/lockfiles; blocked production demo seed; scripts/test-production.cjs.

Frontend: package manifest/lockfile for the patched compatible router release. No page redesign or user data changes were made.
