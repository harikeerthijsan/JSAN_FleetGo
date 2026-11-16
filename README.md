# FleetGo

**Enterprise Fleet Logistics Management Platform — CTS–Google Engagement**

FleetGo is a centralized platform for managing the complete vehicle lifecycle:
inventory, requests and approvals, allocation and dispatch, live GPS tracking,
vehicle inspection and digital handover, vendor management, disk/media
logistics, and operations reporting.

> **Status — Phase 5 implemented.**
> **Phase 1** delivered the architecture, app shell, reusable UI library,
> modular backend, PostgreSQL + Prisma connectivity and health-check API.
> **Phase 2** added **Authentication, RBAC and User & Organization management**
> (JWT access + rotating refresh tokens). See [`docs/PHASE2_AUTH.md`](docs/PHASE2_AUTH.md).
> **Phase 3** adds **Fleet & Master Management** — vehicle registration and
> lifecycle, a controlled status model, master data (makes/models/types/
> categories/fuel/ownership/document types/depots), vehicle documents & photos,
> and fleet dashboards. See [`docs/PHASE3_FLEET.md`](docs/PHASE3_FLEET.md).
> **Phase 4** adds independent Inventory Management: receipts, imports, custody, reservations, transfers and reconciliation. See [`docs/PHASE4_INVENTORY.md`](docs/PHASE4_INVENTORY.md).
> **Phase 5** adds Ticketing & Approvals: multi-type requests, a configurable
> approval-workflow engine, SLA tracking, in-app notifications and read-only
> inventory availability. See [`docs/PHASE5_TICKETING.md`](docs/PHASE5_TICKETING.md).
> Remaining workflows (full allocation/dispatch, tracking, inspections) are
> **not implemented yet** — see the [roadmap](#future-module-roadmap).

FleetGo operates as an **independent application**. It does **not** integrate
with AtlasOps.

---

## Table of Contents

- [Technology Stack](#technology-stack)
- [Architecture Overview](#architecture-overview)
- [Repository / Folder Structure](#repository--folder-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [PostgreSQL Setup](#postgresql-setup)
- [Prisma Setup](#prisma-setup)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Future Module Roadmap](#future-module-roadmap)
- [Additional Documentation](#additional-documentation)

---

## Technology Stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | React 18, Vite, TypeScript, React Router, Axios, **plain CSS**    |
| Backend    | Node.js, Express, TypeScript (REST, `/api/v1`)                    |
| Database   | PostgreSQL + Prisma ORM                                           |
| Validation | Zod (environment + request validation)                           |
| Security   | Helmet, CORS, compression                                        |
| Readiness  | JWT (Phase 2), WebSocket (tracking), File/object storage         |

> Tailwind CSS is **not** used. Styling is plain, modular CSS with a shared
> design-token system (`frontend/src/styles/variables.css`).

---

## Architecture Overview

FleetGo is a **monorepo** with two independently maintainable applications and
a shared documentation set:

```
FleetGo/
├── backend/    Express + TypeScript + Prisma REST API
├── frontend/   React + Vite + TypeScript single-page app
└── docs/       Architecture & inventory-module design
```

The **backend** is organized by business domain under `src/modules/*`. Each
domain owns its own controller → service → repository → routes → validators,
giving every module clear API and service boundaries. Only the `health` module
is active in Phase 1; the remaining 14 domains are scaffolded as placeholders.

The **frontend** separates a reusable UI component library (`components/`),
structural `layouts/`, and feature `modules/`. **Inventory Management is a
standalone top-level module** — it is not nested under Fleet Management.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and
[`docs/INVENTORY_ARCHITECTURE.md`](docs/INVENTORY_ARCHITECTURE.md) for the
Inventory module's planned entities and cross-module interactions.

---

## Repository / Folder Structure

### Backend (`backend/`)

```
src/
├── config/          Env validation (Zod) + typed app config
├── database/        Prisma client singleton + connectivity helpers
├── middlewares/     requestLogger, validate, notFound, errorHandler
├── modules/         Business domains (controller/service/repository/routes/validators)
│   ├── health/      ✅ implemented (health-check)
│   ├── auth/        ▫ placeholder (Phase 2)
│   ├── users/       ▫ placeholder (Phase 2)
│   ├── fleet/       ▫ placeholder
│   ├── inventory/   ▫ placeholder (Phase 4)
│   ├── tickets/ allocation/ dispatch/ tracking/ inspections/
│   ├── vendors/ reports/ disk-logistics/ notifications/ audit/
├── routes/          API v1 router aggregator
├── types/           Shared backend types
├── utils/           logger, ApiError, ApiResponse, asyncHandler, storage/
├── validators/      Shared Zod schemas (pagination, id params)
├── app.ts           Express app factory
└── server.ts        HTTP bootstrap + graceful shutdown
prisma/
└── schema.prisma    Datasource + generator (no business models yet)
```

### Frontend (`frontend/`)

```
src/
├── assets/          Static assets
├── components/      Reusable UI library (Button, Card, DataTable, Modal, …)
├── layouts/         AppLayout, Sidebar, Header
├── pages/           Shared pages (ModulePlaceholder, NotFound)
├── modules/         Feature modules (dashboard, fleet, inventory, …)
├── routes/          Router + navigation config (single source of truth)
├── services/        Axios client + per-domain API services
├── hooks/           Reusable hooks (useHealth, useDocumentTitle)
├── context/         React contexts (SidebarContext)
├── styles/          Design tokens + global CSS
├── types/           Shared TS types (API contracts)
└── utils/           Helpers (classNames)
```

---

## Prerequisites

- **Node.js** ≥ 18 (developed on Node 24)
- **npm** ≥ 9
- **PostgreSQL** ≥ 14 running locally or reachable via `DATABASE_URL`

---

## Installation

Clone the repository, then install dependencies for each application:

```bash
# Backend
cd backend
npm install

# Frontend (in a separate terminal)
cd frontend
npm install
```

---

## PostgreSQL Setup

FleetGo needs a PostgreSQL database. Any PostgreSQL ≥ 14 works; use **one** of
the options below.

### Option A — Dedicated local cluster (recommended for dev, no Docker)

This repo includes a helper that creates an **isolated** PostgreSQL cluster from
your installed PostgreSQL binaries on port **5433**, separate from any existing
instance. It matches the `DATABASE_URL` shipped in `backend/.env.example`.

```powershell
# One-time: create the cluster + 'fleetgo' database, then start it
pwsh ./scripts/local-db.ps1 init

# Thereafter
pwsh ./scripts/local-db.ps1 start     # start
pwsh ./scripts/local-db.ps1 stop      # stop
pwsh ./scripts/local-db.ps1 status    # status
```

> The bundled cluster uses superuser `fleetgo` / password `fleetgo_dev_pwd`,
> database `fleetgo`. Edit the port/paths at the top of the script if needed and
> keep `backend/.env` `DATABASE_URL` in sync.

### Option B — Use your own PostgreSQL

1. Create a database and role, e.g.:

   ```sql
   CREATE DATABASE fleetgo;
   ```

2. Set `DATABASE_URL` in `backend/.env` to your instance:

   ```
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/fleetgo?schema=public"
   ```

> The backend starts even if the database is unreachable — it reports a
> `degraded` status via the health endpoint. Connect the database and the
> status flips to `ok`.

---

## Prisma Setup

```bash
cd backend

# 1. Generate the Prisma client
npm run prisma:generate

# 2. Apply migrations (creates the Phase 2 auth/RBAC/organization tables)
npm run prisma:migrate       # development
# or, for an existing migration history / production:
npm run prisma:deploy

# 3. Seed roles, permissions, synthetic organizations and test users
npm run db:seed              # idempotent — safe to re-run
```

Other useful commands:

```bash
npm run prisma:studio        # browse data in Prisma Studio
```

> After seeding you can sign in with the development accounts below (all use
> password **`FleetGo123`**).

---

## Environment Configuration

Copy the example files and adjust values. **Never commit real secrets.**

```bash
# Backend
cd backend
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env

# Frontend
cd frontend
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Key variables:

| File             | Variable            | Purpose                                        |
| ---------------- | ------------------- | ---------------------------------------------- |
| `backend/.env`   | `PORT`              | API port (default `4000`)                      |
| `backend/.env`   | `DATABASE_URL`      | PostgreSQL connection string                   |
| `backend/.env`   | `CORS_ORIGINS`      | Comma-separated allowed origins                |
| `backend/.env`   | `STORAGE_DRIVER`    | `local` \| `s3` \| `gcs` (readiness)           |
| `backend/.env`   | `JWT_ACCESS_SECRET` | Secret for short-lived access tokens           |
| `backend/.env`   | `JWT_REFRESH_SECRET`| Secret for refresh-token signing               |
| `backend/.env`   | `COOKIE_SAMESITE`   | Refresh cookie SameSite (`strict`/`lax`/`none`)|
| `backend/.env`   | `AUTH_RATE_LIMIT_MAX` | Max auth attempts per window (brute-force)   |
| `frontend/.env`  | `VITE_API_BASE_URL` | API base (default `/api/v1`, proxied in dev)   |

> Generate strong secrets with:
> `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

---

## Running the Application

Open two terminals.

**Backend** (`http://localhost:4000`):

```bash
cd backend
npm run dev
```

**Frontend** (`http://localhost:5173`):

```bash
cd frontend
npm run dev
```

The Vite dev server proxies `/api/*` to the backend, so no CORS configuration
is needed in development. Open <http://localhost:5173> — you'll land on the
**sign-in page**. Use a development account (below) to log in; the sidebar and
pages adapt to your role's permissions.

Production builds:

```bash
cd backend  && npm run build && npm start
cd frontend && npm run build && npm run preview
```

---

## API Documentation

Base URL: `http://localhost:4000/api/v1`

All responses use a standard envelope:

```jsonc
// Success
{
  "success": true,
  "message": "FleetGo API is healthy",
  "data": { /* ... */ },
  "timestamp": "2026-11-02T10:00:00.000Z"
}

// Error
{
  "success": false,
  "error": { "code": 404, "message": "Route not found: GET /api/v1/foo" },
  "timestamp": "2026-11-02T10:00:00.000Z"
}
```

### `GET /api/v1/health`

Returns application status and database connectivity.

- **200** when healthy, **503** when degraded (API up, database down).

```jsonc
{
  "success": true,
  "message": "FleetGo API is healthy",
  "data": {
    "application": "FleetGo",
    "status": "ok",              // ok | degraded | down
    "environment": "development",
    "version": "1.0.0",
    "uptimeSeconds": 42,
    "database": { "status": "connected" },  // connected | disconnected
    "timestamp": "2026-11-02T10:00:00.000Z"
  },
  "timestamp": "2026-11-02T10:00:00.000Z"
}
```

### Authentication, Users, Roles & Organizations (Phase 2)

Phase 2 adds authentication and administration endpoints under `/api/v1`:

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- `POST /auth/change-password`, `POST /auth/forgot-password`, `POST /auth/reset-password`
- `GET|POST /users`, `GET|PUT /users/:id`, `PATCH /users/:id/status`, `POST /users/:id/reset-password`
- `GET|POST /roles`, `GET|PUT /roles/:id`, `GET /permissions`
- `GET|POST /organizations`, `GET|PUT /organizations/:id`

Full request/response details, the token model, the RBAC permission matrix and
security notes are in **[`docs/PHASE2_AUTH.md`](docs/PHASE2_AUTH.md)**.

### Fleet & Master Data (Phase 3)

- `GET /fleet/stats`, `GET /fleet/status-transitions`
- `GET|POST /fleet/vehicles`, `GET|PUT|DELETE /fleet/vehicles/:id`,
  `PATCH /fleet/vehicles/:id/status`, `GET /fleet/vehicles/:id/history`
- `GET|POST /fleet/vehicles/:id/documents`,
  `GET /fleet/vehicles/:id/documents/:docId/download`,
  `DELETE /fleet/vehicles/:id/documents/:docId`
- `GET|POST /master-data/:resource`, `PUT|DELETE /master-data/:resource/:id`,
  `PATCH /master-data/:resource/:id/status`
  (`:resource` = makes, models, categories, types, fuel-types,
  ownership-types, document-types, depots)

Details, the vehicle status lifecycle and the permission matrix are in
**[`docs/PHASE3_FLEET.md`](docs/PHASE3_FLEET.md)**.

### Development login accounts (synthetic — password `FleetGo123`)

| Email | Role |
| ----- | ---- |
| superadmin@fleetgo.dev | Super Admin |
| jsanadmin@fleetgo.dev | JSAN Admin |
| opsmanager@fleetgo.dev | Operations Manager |
| ctsuser@fleetgo.dev | CTS User |
| vendor1@fleetgo.dev / vendor2@fleetgo.dev | Vendor User |
| driver@fleetgo.dev | Transporter / Driver |

> Remaining business endpoints (inventory, tickets, dispatch, tracking,
> inspections) are **not** implemented yet. Each will be documented as its
> module is built.

---

## Future Module Roadmap

| Phase | Scope                                                             |
| ----- | ---------------------------------------------------------------- |
| **1** | ✅ Project setup, architecture, UI shell, health API              |
| **2** | ✅ Authentication, RBAC, User & Organization management (JWT)     |
| **3** | ✅ Fleet & Master Management (vehicles, lifecycle, master data)   |
| **4** | ✅ Inventory Management (receipts, import, custody, reservations, reconciliation) |
| **5** | ✅ Ticketing & Approvals (configurable workflow engine, SLA, notifications) |
| **6** | ✅ Vehicle Allocation, Dispatch & Trips                          |
| **7** | ✅ Live GPS Tracking (WebSocket)                                 |
| **8** | ✅ Inspection & Digital Handover (checklists, POD, discrepancies) |
| **9** | ✅ Dashboard & Reporting (role-scoped aggregation, exports)      |
| **10** | ✅ Disk & Media Logistics (custody, shipments, reconciliation)  |
| **11** | ✅ Vendor Management (profiles, contacts, locations, users, inventory) |
| **12** | ✅ Settings (system-settings registry + per-user preferences)    |

---

## Additional Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system architecture, module
  boundaries, request lifecycle, and key decisions.
- [`docs/INVENTORY_ARCHITECTURE.md`](docs/INVENTORY_ARCHITECTURE.md) — Inventory
  Management design, planned entities/relationships, and how it interacts with
  Fleet, Allocation, Dispatch, Tracking, and Inspection.
- [`docs/PHASE2_AUTH.md`](docs/PHASE2_AUTH.md) — authentication & RBAC design,
  token model, full API reference, permission matrix, security checklist and
  development test accounts.
- [`docs/PHASE3_FLEET.md`](docs/PHASE3_FLEET.md) — Fleet & Master Management:
  data model, vehicle status lifecycle, full API reference, RBAC additions,
  file storage, and test results.
- [`docs/PHASE4_INVENTORY.md`](docs/PHASE4_INVENTORY.md) — Inventory Management:
  receipts, imports, custody, reservations, transfers, reconciliation.
- [`docs/PHASE5_TICKETING.md`](docs/PHASE5_TICKETING.md) — Ticketing & Approvals:
  ticket types, configurable approval-workflow engine, SLA, notifications,
  inventory availability integration, API reference and test results.

## Phase 4 — Inventory Management

Inventory is now an independent, active top-level module. It includes database-derived dashboards, individual receipts and evidence, Excel/CSV import with preview and error reports, inventory search/filter/export, reservations, custody/movement history, transfers, reconciliation with independent review, and auditable corrections.

Existing vehicles, depots, organizations/vendors, users and storage are reused. The commercial planning baseline remains **802 vehicles**; synthetic development records do not establish a confirmed production count.

For an existing local setup:

```powershell
cd backend
npm install
npm run prisma:generate
npm run prisma:deploy
npm run inventory:enable
npm run dev
```

Open `/inventory` after signing in. Backend tests: `cd backend` then `npm run test:inventory` (creates retained synthetic `P4-` records). Frontend and backend production builds passed, and the final Phase 4 suite passed 100 assertions. See [Phase 4 API, screens, file summary, tests and known limitations](docs/PHASE4_INVENTORY.md) and [test output](docs/phase4-test-results.txt).

Earlier Phase 1–3 sections describe their delivery milestones. Inventory is no longer a placeholder; ticketing, full allocation/dispatch, GPS tracking, inspections and disk logistics remain future work. Phase 4 adds integration contracts only for future workflows.

## Phase 6 — Vehicle Allocation & Dispatch

Vehicle Allocation and Dispatch & Trips are active at `/allocations` and `/dispatch`. Approved tickets link directly to allocation with requested/allocated/pending quantities. This phase adds multi-vehicle/partial allocation, availability selection, transport/driver management, checklists and original photographic evidence, guarded departure, trip milestones/timelines, exceptions, reporting and scoped tracking metadata.

Inventory changes remain centralized. Departure records transporter custody; arrival records DELIVERED status without prematurely making stock available before receiving verification. No GPS/maps, full receiving inspection or disk logistics were implemented.

Existing installations:

```powershell
cd backend
npm run prisma:generate
npm run prisma:deploy
npm run operations:enable
npm run dev
```

Frontend: `cd frontend` then `npm run dev`. Both production builds pass. Validation: **134 Phase 6 workflow checks, 34 guard checks, and 139 inventory regression assertions passed**, plus targeted API/policy/filter checks. Tests retain synthetic development records.

See [Phase 6 API, architecture, screens, file summary, validation and pending integrations](docs/PHASE6_OPERATIONS.md). Stop here for review before Phase 7.


## Phase 7 - Live GPS Tracking

Live tracking is available at /tracking: source-labelled live maps, authenticated WebSocket updates, vehicle details, chronological location history, route replay/export, device mappings, provider settings, geofences, alerts and reports. Real and simulated sources remain separate. GPS never confirms delivery or changes inventory/custody; existing Phase 6 operational actions remain authoritative.

For an existing database, in backend run npm install, npm run prisma:generate, npm run prisma:deploy, npm run tracking:enable, then npm run dev. In frontend run npm install then npm run dev in a separate terminal.

Migration 20261103170000_phase7_tracking is applied. Both applications run locally: [frontend tracking](http://localhost:5173/tracking), backend http://localhost:4000. Register/map a device on a confirmed active trip before starting tracking; no coordinates are generated by default. Development manual observations are always SIMULATED.

Validation: **206 combined Phase 6/7 workflow assertions, 34 dispatch guard assertions, 159 inventory assertions, and 10 React/Leaflet map component assertions passed**. Frontend/backend builds pass; HTTP and WebSocket proxy checks pass. Synthetic test history is retained. Real browser visual/keyboard/mobile QA and hardware/provider acceptance remain outstanding; no production provider or credentials were supplied.

See [Phase 7 API, file manifest, setup, tests, limitations and production provider requirements](docs/PHASE7_TRACKING.md), [workflow output](docs/phase7-workflow-results.txt), [guard output](docs/phase7-guards-results.txt), [inventory output](docs/phase7-inventory-results.txt) and [map/proxy output](docs/phase7-map-results.txt). Provider credentials belong only in backend environment secrets. In production simulation defaults off unless explicitly enabled. Set TRACKING_SIMULATION_ENABLED=false to disable it.

Earlier phase sections are historical delivery milestones. Tracking is now implemented; disk logistics remains a future phase.

## Phase 8 — Inspection & Digital Handover

Available at `/inspections`: an inspection dashboard; initial CTS receipt, pre-dispatch, receiving and return inspections with checklists and categorized photographs; a dispatch-vs-receiving photo comparison baseline; damage/discrepancy management with an auditable resolution workflow; digital handover with acknowledgements; and printable Proof of Delivery. Submitted inspections are immutable (corrections are new versions; original photographs are retained). A confirmed MAJOR/CRITICAL discrepancy marks a vehicle unavailable **only** through the centralized Inventory service. GPS proximity and image differences never confirm delivery, custody or damage — authorized workflow actions do. Existing Inventory, Ticketing, Dispatch and GPS behavior is unchanged.

For an existing database, in `backend` run `npm install`, `npm run prisma:generate`, `npm run prisma:deploy`, `npm run inspections:enable`, then `npm run dev`. In `frontend` run `npm install` then `npm run dev` in a separate terminal. Migration `20261103180000_phase8_inspections_handover` is additive.

A pre-dispatch inspection that has been started must be submitted before the dispatch can be confirmed (a rejected inspection blocks confirmation). Set `INSPECTION_PREDISPATCH_REQUIRED=true` to additionally require a completed pre-dispatch inspection to exist for every vehicle; it defaults off so earlier flows are unaffected. The documented commercial baseline is 802 vehicles; no larger fleet is assumed. AI-assisted damage detection is an optional, clearly-labelled suggestion interface only (`aiSuggested`/`aiConfirmed`) — no model is bundled and every suggestion requires human confirmation.

Validation: **205 combined Phase 6/8 workflow assertions passed**, plus the full regressions — **206 Phase 6/7 tracking, 34 dispatch guard and 247 inventory assertions** — all green. Frontend and backend production builds pass. Reproduce with the same `GPS_PHASE7_TEST_SECRET` set on the local API and test process, then `cd backend; npm run test:inspections` (extends the Phase 6 fixture; retains synthetic `P6-` records). See [Phase 8 API, models, screens, file manifest, tests, permissions and known issues](docs/PHASE8_INSPECTIONS.md) and [test output](docs/phase8-test-results.txt).

POD is delivered as a server-rendered, self-contained printable HTML document (browser "Save as PDF"), avoiding a heavy server PDF dependency. Real browser visual/keyboard/mobile QA remains outstanding.

## Phase 9 — Dashboard & Reporting

A role-aware operational dashboard at `/dashboard` and a reporting module at `/reports` that read the existing modules as the single source of truth via database aggregation — no duplicated business data. The dashboard shows summary cards (fleet by status, active tickets, pending approvals, delayed trips, completed deliveries), key charts and a live operational-monitoring grid that links into each record. Reports cover fleet, inventory, tickets & approvals, dispatch & delivery, GPS tracking, inspection & damage and vendor/transporter performance, plus a Report Builder, Saved Reports and Export History. CSV, Excel and print-ready PDF exports reuse the same scoped query, so exported totals always match the screen.

Every dashboard/report query is scoped by role and organization: vendors and CTS users see only their own data; operations managers are depot-scoped; admins see everything. Metric rules are documented (utilization excludes available/reserved; on-time % excludes cancelled and separates failed; GPS distance only from recorded VALID/LOW fixes; approval time/SLA only from real timestamps; vendor metrics are measurable-only with no arbitrary score). The scheduled-report service is a configuration/status interface only — no email is sent and no credentials are invented.

For an existing database, in `backend` run `npm install`, `npm run prisma:generate`, `npm run prisma:deploy`, then `npm run dev`. No enable script is needed (reuses `reports:read`, held by all roles). Migration `20261104090000_phase9_reporting` is additive (saved reports, export history, scheduled-report interface).

Validation: **31 reporting assertions passed** (dashboards, all nine datasets, metric rules, CSV/Excel/PDF exports with totals matching the screen, role/organization isolation, date boundaries, empty datasets, saved reports, scheduled interface, export history), with regressions green — **Phase 7 tracking 206, Phase 8 inspections 205, dispatch guards 34, inventory 273**. Frontend and backend production builds pass. Reproduce with the API running against a seeded dev DB: `cd backend; npm run test:reports`. See [Phase 9 APIs, metric definitions, screens, file manifest, tests and limitations](docs/PHASE9_REPORTING.md) and [test output](docs/phase9-test-results.txt).

## Phase 10 — Disk & Media Logistics

Physical storage media (HDD, SSD, TAPE, OPTICAL, FLASH, …) are now tracked end
to end at `/disk-logistics`, independently of the vehicle inventory. Each disk
has its own status lifecycle, append-only movement ledger and chain of custody.
Media moves between CTS, depots, vendors and transporters via **shipments**
(plan → dispatch → track → receive), damaged/missing arrivals raise
**discrepancies**, and periodic **reconciliations** are independently reviewed
(`disk:review`) before any stock adjustment is applied. A tracking event never
confirms delivery; only an explicit receipt changes custody. Confirming a
MAJOR/CRITICAL discrepancy marks a disk DAMAGED or LOST.

For an existing database, in `backend` run `npm install`,
`npm run prisma:generate`, `npm run prisma:deploy`, `npm run disk:enable`, then
`npm run dev`. In `frontend` run `npm install` then `npm run dev`. Migration
`20261104120000_phase10_disk_logistics` is additive; `disk:enable` only grants
`disk:read` / `disk:manage` / `disk:review` to the appropriate roles and creates
no data.

Validation: **63 disk assertions passed** (registration/bulk, status
transitions, shipment dispatch/track/receive incl. EXCEPTION and clean delivery,
custody chain + in-shipment guard, discrepancy state machine with CONFIRMED
MAJOR → DAMAGED, reconciliation draft→submit→review with MISSING → LOST, vendor
RBAC/scope isolation, and idempotency), with regressions green — **Phase 8
inspections 205, Phase 9 reporting 31**. Backend and frontend production builds
pass. See [Phase 10 APIs, lifecycle, screens, file manifest, tests and
limitations](docs/PHASE10_DISK_LOGISTICS.md) and
[test output](docs/phase10-test-results.txt).

## Phase 11 — Vendor Management

The **Vendor Management** workspace at `/vendors` is now fully functional (it was
previously a "Soon" placeholder). A vendor is an `Organization` of type
`VEHICLE_VENDOR` or `TRANSPORT_PARTNER` — this module reuses that identity (no
duplicate vendor entity) and adds vendor registration, a richer profile, multiple
contacts and locations, assigned-user management, status management, and
**vendor-wise vehicle & disk inventory**. Every read is organization-scoped and
every write requires `vendors:manage`, so a vendor user sees only their own
record and cannot modify it.

For an existing database, in `backend` run `npm install`,
`npm run prisma:generate`, `npm run prisma:deploy`, `npm run vendors:enable`, then
`npm run dev`. In `frontend` run `npm install` then `npm run dev`. Migration
`20261104150000_phase11_vendor_management` is additive (vendor profile, contacts,
locations); `vendors:enable` grants `vendors:read`/`vendors:manage` to the
appropriate roles (vendor users get read access to their own org) and creates no
data.

Each vendor's detail aggregates existing records by organization id — assigned
and in-custody vehicles, disks in custody, allocations, dispatches, inspections
and open tickets — so vendor information is integrated with fleet allocation,
dispatch, inspections and disk logistics without duplicating any data. A vendor
that currently holds vehicles or disks in custody cannot be deactivated.

Validation: **33 vendor assertions passed** (register/duplicate, profile update,
contact & location CRUD with single-primary rule, user assign/unassign with
foreign-org rejection, status + custody-based deactivation guard, vendor-wise
disk/vehicle inventory, and vendor/operations RBAC + scope isolation), with
regressions green — **Phase 8 inspections 205, Phase 9 reporting 31, Phase 10
disk 63**. Backend and frontend production builds pass. See
[Phase 11 APIs, model, screens, file manifest, tests and limitations](docs/PHASE11_VENDOR_MANAGEMENT.md)
and [test output](docs/phase11-test-results.txt).

## Phase 12 — Settings

The **Settings** workspace at `/settings` is now functional (it was the last
"Soon" placeholder in the sidebar). It provides a persisted, admin-managed
**system-settings registry** (typed, validated, audited, resettable) and
per-user **preferences** (theme, density, default landing page, notification
toggles). System settings require `settings:manage` (admins); preferences are
available to any authenticated user for their own account.

For an existing database, in `backend` run `npm install`,
`npm run prisma:generate`, `npm run prisma:deploy`, `npm run settings:enable`,
then `npm run dev`. In `frontend` run `npm install` then `npm run dev`. Migration
`20261104170000_phase12_settings` is additive (`system_settings`,
`user_preferences`); `settings:enable` grants `settings:manage` to administrators
and seeds the default settings catalogue (idempotent, never overwriting saved
values).

Validation: **17 settings assertions passed** (catalogue listing, typed update
validation for NUMBER/BOOLEAN, read-only + unknown-key guards, reset-to-default,
per-user preference create/update/validation, and the `settings:manage` RBAC
boundary), with regressions green — **Phase 8 inspections 205, Phase 9 reporting
31, Phase 10 disk 63, Phase 11 vendors 33**. Backend and frontend production
builds pass. See [Phase 12 APIs, catalogue, screens, file manifest, tests and
limitations](docs/PHASE12_SETTINGS.md) and
[test output](docs/phase12-test-results.txt).

**Phases 1–12 are complete, and every sidebar module is now functional. Do not
start any further phase without approval.**
