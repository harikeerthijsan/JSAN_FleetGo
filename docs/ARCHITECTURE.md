# FleetGo — System Architecture

_Phase 1 foundation. This document describes the technical architecture that
all future modules build on. It is a living document and will be expanded as
modules are implemented._

---

## 1. Goals & Principles

- **Modular by business domain.** Each domain (auth, users, fleet, inventory,
  …) is self-contained with clear API and service boundaries, so modules can be
  developed, tested, and reasoned about independently.
- **Independent apps.** Frontend and backend are separate applications with no
  shared build coupling — each can be deployed and scaled on its own.
- **Standalone platform.** FleetGo does **not** integrate with AtlasOps.
- **Scalable baseline.** Designed for an initial baseline of **802 vehicles**
  with room to grow; the data model favors transactional movement history over
  manually maintained counts (see Inventory doc).
- **Readiness over premature implementation.** Auth, file storage, and
  WebSockets are architected now (interfaces, config, placeholders) but not
  implemented until their phase.

---

## 2. High-Level Topology

```
┌─────────────────────────┐        HTTP / JSON         ┌──────────────────────────┐
│   Frontend (React/Vite) │  ───────────────────────▶  │   Backend (Express API)   │
│   http://localhost:5173 │   /api/v1/*  (proxied in   │   http://localhost:4000   │
│                         │   dev via Vite)            │                           │
│  • UI component library │  ◀───────────────────────  │  • Domain modules         │
│  • Module pages         │   standard JSON envelope   │  • Middlewares            │
│  • Axios services       │                            │  • Prisma data access     │
└─────────────────────────┘                            └────────────┬─────────────┘
                                                                     │ Prisma
                                                                     ▼
                                                        ┌──────────────────────────┐
                                                        │   PostgreSQL              │
                                                        └──────────────────────────┘

Future (later phases):
  • WebSocket channel for live GPS tracking
  • Object storage (S3/GCS) for vehicle photos & documents
```

---

## 3. Backend Architecture

### 3.1 Layered module structure

Each business domain under `src/modules/<domain>/` follows a strict layering:

```
routes  →  controller  →  service  →  repository  →  Prisma  →  PostgreSQL
 (HTTP)     (req/res)      (logic)     (data access)
validators ┘
```

- **Routes** declare endpoints and attach validation + controller handlers.
- **Controllers** translate HTTP ↔ domain calls. No business logic.
- **Services** hold business logic and orchestrate repositories. This is where
  transactional operations (e.g. inventory custody changes) will live.
- **Repositories** are the only layer that touches Prisma, keeping data access
  swappable and testable.
- **Validators** are Zod schemas describing request shapes.

Only `health` is implemented in Phase 1. Every other domain folder contains a
README describing its intended structure.

### 3.2 Cross-cutting concerns

| Concern            | Location                              | Notes                                             |
| ------------------ | ------------------------------------- | ------------------------------------------------- |
| Configuration      | `config/env.ts`, `config/index.ts`    | Zod-validated env, fail-fast at startup, typed    |
| Database           | `database/prisma.ts`                  | Singleton client, connect/disconnect, `SELECT 1`  |
| Logging            | `utils/logger.ts` + `requestLogger`   | Level-based central logger; morgan pipes into it  |
| Error handling     | `middlewares/errorHandler.ts`         | Central handler; `ApiError` → standard envelope   |
| Validation         | `middlewares/validate.ts`             | Generic Zod validator for body/query/params       |
| Responses          | `utils/ApiResponse.ts`                | One success/error envelope for all endpoints      |
| Storage            | `utils/storage/*`                     | `StorageProvider` interface + local stub          |
| Security           | `app.ts` (helmet, cors, body limits)  | Hardened defaults                                 |

### 3.3 Request lifecycle

```
Incoming request
  → helmet / cors / json body parser / compression
  → requestLogger (morgan → logger.http)
  → API v1 router  (/api/v1/...)
      → validate(schema)        [per-route, optional]
      → controller (asyncHandler)
          → service → repository → Prisma
      → ApiResponse.success(...)
  → notFound (if unmatched)
  → errorHandler (ApiError → ApiResponse.error)
```

`asyncHandler` guarantees rejected promises reach `errorHandler` instead of
crashing the process.

### 3.4 Standard response envelope

Every endpoint returns the same shape (see README for examples), so the
frontend has exactly one success and one error contract to handle.

### 3.5 Planned backend domains

`auth`, `users`, `fleet`, `inventory`, `tickets`, `allocation`, `dispatch`,
`tracking`, `inspections`, `vendors`, `reports`, `disk-logistics`,
`notifications`, `audit`.

Each registers its router in `src/routes/index.ts` under `/api/v1/<domain>`
when implemented.

---

## 4. Frontend Architecture

### 4.1 Composition

```
main.tsx → App (BrowserRouter) → AppRoutes
                                   └─ AppLayout (SidebarProvider)
                                        ├─ Sidebar   (from NAV_ITEMS)
                                        ├─ Header
                                        └─ <Outlet/> → module pages
```

- **`routes/navigation.ts`** is the single source of truth for the primary
  navigation; both the Sidebar and the Router derive from it.
- **`components/`** is a dependency-free, reusable UI library (design tokens +
  plain modular CSS). Components are consumed via the `@/components` barrel.
- **`modules/<domain>/pages/`** hold feature pages. In Phase 1 all modules
  except Dashboard render a shared `ModulePlaceholder`.
- **`services/`** wrap Axios; `apiClient.ts` centralizes base URL, timeouts,
  and error normalization, with a request interceptor reserved for the Phase 2
  JWT.

### 4.2 Styling

Plain CSS with a shared token layer (`styles/variables.css`): colors (blue +
white enterprise theme), typography, spacing, radius, shadows, and layout
dimensions. Component styles are colocated (`Component.css`) and scoped via
`fg-` prefixed class names. **No Tailwind.**

### 4.3 Responsiveness

The shell adapts at `960px` (sidebar becomes an overlay drawer) and `560px`
(condensed header). The content area is centered with a max width for large
displays.

---

## 5. Data Layer

- **PostgreSQL** via **Prisma ORM**.
- Phase 1 ships no business models; a single documented placeholder model
  (`SystemMeta`) exists only so `prisma generate` succeeds. Connectivity is
  verified with a raw `SELECT 1`, so no business tables are created prematurely.
- Business models arrive per phase. Inventory (Phase 4) is designed around an
  **immutable movement ledger** plus a **derived current-state** record, rather
  than hand-maintained stock counts — see `INVENTORY_ARCHITECTURE.md`.
- Transactional integrity: operations that change custody/availability will run
  inside Prisma interactive transactions (`prisma.$transaction`) to prevent
  duplicate allocation and inconsistent custody.

---

## 6. Readiness (architected, not yet implemented)

| Capability     | Readiness in Phase 1                                               | Implemented in |
| -------------- | ------------------------------------------------------------------ | -------------- |
| Authentication | JWT config placeholders; request interceptor + `auth` module stub  | Phase 2        |
| File storage   | `StorageProvider` interface + `LocalStorageProvider` stub + config | Phase 6        |
| WebSockets     | Config flags (`WS_ENABLED`, `WS_PATH`); frontend `VITE_WS_URL`     | Phase 7        |
| Notifications  | `notifications` module placeholder                                 | Phase 8        |
| Audit logging  | `audit` module placeholder                                         | Phase 8        |

---

## 7. Key Decisions

1. **Monorepo, two apps.** Simpler coordination than split repos, while keeping
   frontend/backend independently buildable and deployable. No microservices —
   unnecessary at this scale.
2. **Domain modules over technical layers at the top level.** Grouping by
   business domain keeps related code together and enforces boundaries, which
   matters for a platform with 14 planned domains.
3. **Zod for both env and request validation.** One validation library,
   type-safe, single source of truth; env is validated at startup (fail fast).
4. **Standard response envelope + central error handler.** Predictable client
   contract and no leaking of internal errors in production.
5. **Storage abstraction up front.** Business modules depend on an interface,
   so switching local disk → S3/GCS later needs zero business-code changes.
   Binary files never live in PostgreSQL — only metadata/references will.
6. **Health endpoint returns 503 when degraded.** Lets load balancers/monitors
   react, while the payload still carries full status for the dashboard.
7. **Inventory is independent of Fleet.** Separate top-level module and route,
   reflecting that inventory custody/movement is a distinct concern from fleet
   operations.
