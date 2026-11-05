# Codex change log

## Instructions for future work

- Read this file before making changes to this project.
- Log every change made by Codex in this file from now on, including code, configuration, documentation, and file additions or deletions.
- Update this log as part of the same task as the changes. Keep existing entries and append new entries in chronological order.
- For each entry, record the date, files changed, what changed and why, and any verification performed or remaining limitations.
- Record run-only tasks explicitly as having no code changes. Never include secrets or credentials.

## Log

### 2026-11-03 — Run the project

- Changes: None. Started the existing backend and frontend development servers.
- Verification: Frontend returned HTTP 200 at http://localhost:5173. Backend health endpoint at http://localhost:4000/api/v1/health reported healthy with the database connected.

### 2026-11-03 — Establish the Codex change log

- Files changed: `codex.md` (created).
- Changes: Added ongoing logging instructions and recorded the project startup task and this file's creation, as requested by the user.
- Verification: Documentation-only change; no application code changed.

### 2026-11-03 — Premium authentication design

- Files changed: `frontend/src/modules/auth/components/AuthShell.tsx`, `frontend/src/modules/auth/components/AuthShell.css`, `frontend/src/modules/auth/pages/LoginPage.tsx`.
- Changes: Replaced the centered login card with a responsive split layout, deep navy and mint branding, an SVG fleet route illustration, refined typography, spacious form controls, and workspace messaging. Shared password recovery pages inherit the refreshed authentication shell. Collapsed development account details and added an alert role for login errors. Existing authentication logic is unchanged.
- Verification: `npm run build` passed (TypeScript and Vite production build). Browser visual review and interactive sign-in testing were not performed.
- Generated artifacts: Frontend build refreshed ignored/generated output under `frontend/dist` and TypeScript build metadata where configured.

### 2026-11-03 — Fix login headline contrast

- Files changed: `frontend/src/modules/auth/components/AuthShell.css`.
- Changes: Explicitly set the story heading to white so the global heading color cannot make “Your fleet. One clear” disappear against the navy background. Preserved the mint accent on “direction.”
- Verification: Confirmed the scoped heading rule overrides the global heading color; white against #102b33 has approximately 14.8:1 contrast. CSS-only change.

### 2026-11-03 — Premium dashboard workspace

- Files changed: `frontend/src/modules/dashboard/pages/DashboardPage.tsx`, `frontend/src/modules/dashboard/pages/DashboardPage.css`, `frontend/src/layouts/AppLayout/AppLayout.tsx`, `frontend/src/layouts/AppLayout/AppLayout.css`.
- Changes: Added a navy overview banner with fleet navigation, mint accents, refined metric cards, a muted chart palette, polished system status and workspace links, and responsive layouts. Applied matching sidebar/header styling only on `/dashboard`. Preserved live fleet and health data and permission checks. Made metric cards keyboard-accessible and replaced click-only quick links with router links.
- Verification: `npm run build` passed, including TypeScript compilation and Vite production bundling. Browser visual review and interactive dashboard testing were not performed.
- Generated artifacts: Production build refreshed `frontend/dist` and configured TypeScript build metadata.

### 2026-11-03 — Apply premium theme across all pages

- Files changed: `frontend/src/styles/variables.css`, `frontend/src/layouts/AppLayout/AppLayout.tsx`, `frontend/src/layouts/AppLayout/AppLayout.css`, `frontend/src/components/ui/Charts/Charts.tsx`.
- Changes: Promoted the dashboard shell theme to all authenticated routes. Updated shared design tokens to navy, mint, and warm neutral surfaces; unified page headings, cards, tables, form controls, buttons, and modal borders; and aligned shared chart colors. Shared tokens also theme public and fallback pages. Existing permissions, routes, and business logic remain unchanged.
- Verification: `npm run build` passed (TypeScript and Vite). Browser visual review across individual pages was not performed.
- Generated artifacts: Build refreshed `frontend/dist` and configured TypeScript build metadata.

### 2026-11-03 — Animations and special effects

- Files changed: `frontend/src/styles/motion.css` (created), `frontend/src/styles/global.css`, `frontend/src/layouts/AppLayout/AppLayout.tsx`.
- Changes: Added page fades on route changes, heading and login entrances, staggered dashboard metrics, chart reveals, a drawn login route, fleet orbit entrance, subtle radial lighting, tactile buttons, card highlights, and navigation/menu transitions. Hover motion applies to devices supporting hover. Added reduced-motion overrides for decorative and existing component animations. Route content is keyed by pathname so navigation replays its entrance without reacting to query-string changes.
- Verification: `npm run build` passed (TypeScript and Vite). Browser visual and interaction testing were not performed.
- Generated artifacts: Build refreshed `frontend/dist` and configured TypeScript build metadata.

### 2026-11-03 — Make special effects more visible

- Files changed: `frontend/src/styles/motion.css`.
- Changes: Added recurring light sweeps over the dashboard banner and primary workspace buttons, pulsing fleet markers, a drifting mint glow on login, and stronger card lift/glow on hover across pages. Fixed dashboard card entrance fill behavior so it no longer blocks hover transforms. Decorative overlays ignore pointer input; all new animations respect reduced-motion settings.
- Verification: `npm run build` passed. Visual browser review was not performed.
- Generated artifacts: Build refreshed `frontend/dist` and configured TypeScript build metadata.


### 2026-11-03 ? UX review fixes (previous task)

- Changes: Fixed table action propagation and keyboard access, dialog focus trapping/restoration and naming, menu keyboard handling, native required fields/help associations, dashboard refresh/error/empty states and timestamps, semantic status colors, grouped navigation and unavailable modules, all-page CSV exports, filter recovery, vehicle field validation and unsaved-change protection. Reduced recurring effects and improved typography and dashboard task hierarchy.
- Files: Shared table, form, search, modal and menu components; Sidebar, Header, AppLayout; App router; dashboard, vehicle list/form/overview, status metadata, motion styles, placeholder page; added `useUnsavedChanges.ts`.
- Verification: Frontend production build passed. Computer Use ended because the browser URL could not be reliably determined; interactive verification was not completed.

### 2026-11-03 ? Phase 4 inventory implementation (in progress)

- Reviewed existing application, schema, fleet APIs, RBAC, storage and draft inventory models.
- Planned additive schema: AT_VENDOR status; integrity constraints, reconciliation snapshot metadata, operation idempotency and future allocation integration record. Reuse vehicle identity and existing master records; Vehicle.status remains authoritative.
- Scope: Phase 4 only; no ticketing, dispatch orchestration, GPS or inspection workflows.


### 2026-11-03 ? Phase 4 inventory delivered and verified

- Backend: Added inventory validation/routes, centralized transactional/idempotent service, Excel/CSV import preview/commit, scoped reservation and custody/movement operations, append-only evidence, reconciliation snapshot/independent approval and reporting. Added future integration contracts only; no later-phase orchestration UI/APIs.
- Database: Applied `20261103110000_phase4_inventory`. Reused draft inventory models and existing Vehicle/master/User/Organization/Audit/storage entities; added AT_VENDOR, operation idempotency, allocation integration record, snapshot metadata, FK/check/partial-unique constraints and immutable ledger triggers. Regenerated Prisma client.
- Authorization: Added reserve/review permissions and an additive `inventory:enable` script; enforced role, organization, current vendor custody and assigned depot scope. Prevented Fleet updates from bypassing received-vehicle inventory controls.
- Frontend: Activated the top-level Inventory module and implemented dashboard, inventory list/filter/export, individual receiving/evidence, bulk import mapping/preview/results/error export, vehicle profile/availability/timeline, reservations/cancellation, transfers, reconciliation preparation/review and reports. Reused existing components and navy/mint theme.
- Other changes: Installed ExcelJS; added request/file/row/column/archive limits and safe CSV exports; formatted new code. Updated README and inventory module documentation; created `docs/PHASE4_INVENTORY.md` with full file summary, API contract and known issues.
- Verification: Migration applied; backend TypeScript build and frontend TypeScript/Vite build passed. Final synthetic API workflow suite passed 100 assertions; output saved in `docs/phase4-test-results.txt`. Covered receipt/evidence, concurrent reservations, expiry/cancel, movement/custody, independent reconciliation damage/location corrections, stale snapshots, import validation/idempotency, scope/RBAC, existing health/auth/fleet/master reads and PostgreSQL history/reservation constraints. Dev backend and frontend remain available on ports 4000 and 5173.
- Test data: Retained synthetic P4-prefixed vehicles, reconciliation sessions and audit/evidence records; never treated as confirmed commercial stock.
- Review limitation: Automatic approval review rejected runtime testing of future allocation/dispatch/receiving contracts as outside Phase 4; the proposed test was removed without execution. Contracts are compile-checked only. No Phase 5 work was started.
- Other limitations: Browser visual/keyboard checks not completed; expiry is settled lazily on inventory reads; reservations conservatively block immediately including future periods; paginated export is not a frozen snapshot. npm audit reports 9 moderate ExcelJS-chain issues plus 1 high existing Zod 3 issue; incompatible automatic dependency changes were not applied. Details and mitigations are documented.
- Files created/modified: Full source and documentation manifest in `docs/PHASE4_INVENTORY.md`. Generated backend/frontend build artifacts and Prisma client refreshed.

### 2026-11-03 — Phase 5 Ticketing & Approvals (by Claude)

- Scope: implemented Phase 5 (Ticketing & Approvals) end to end. No breaking changes to Phases 1-4.
- Backend: new `tickets` module (tickets + approvals validators/services/controllers/routes, workflow transition map, notifications service). Configurable approval-workflow engine with ordered role-based steps + per-step SLA, resolved per ticket at submission; approve/reject/request-info/reassign/escalate; row-locked decision transactions; self-approval guard; duplicate-operation prevention; read-only inventory availability integration; separate operational vs approval status; in-app notifications.
- Database: migration `20261103103335_phase5_ticketing_approvals` added Ticket, TicketApproval, TicketComment, TicketAttachment, TicketAssignment, TicketActivity, TicketSLA, TicketTypeConfig, ApprovalWorkflow, ApprovalWorkflowStep, Notification (+ enums). Reuses User/Organization/Vehicle/Depot/VehicleType/AuditLog/storage and the Phase 3 Counter. Seed adds type configs, default + maintenance workflows and SLA rules.
- RBAC: added `tickets:manage`; granted to Super Admin/JSAN Admin/Operations Manager; added tickets:create to Vendor User; organization-level isolation + internal-comment hiding enforced in the service.
- Frontend: Ticketing module at `/tickets/*` — dashboard, all/my lists, dynamic create form, ticket details (approval chain, decisions, assignment, status, comments, attachments, activity), approval inbox, workflow configuration, SLA dashboard, reports. React + TS + plain CSS, existing components/theme.
- Verification: backend + frontend typecheck and production-build clean. New suite test-tickets.mjs = 49/49 passing. Regression: auth 48/48, fleet 35/35, inventory 112/112. End-to-end confirmed through the Vite proxy. DB migration applied cleanly.
- Boundaries respected: no allocation/dispatch/GPS/inspection/disk work; integration points only. Synthetic data only.


### 2026-11-03 ? Phase 6 implementation started

- Inspected current Phase 1?5 code, including Claude's ticketing additions, inventory integration contracts and current RBAC.
- Planned additive allocation/item, dispatch/checklist, driver, trip/event, evidence, assignment-history and exception models; reuse existing vehicle/inventory/ticket/organization/depot records.
- Inventory writes remain centralized. Approved-ticket dependencies require targeted approval authorization/concurrency hardening. Delivery will remain unavailable pending later receiving verification. No GPS/maps/full receiving inspections or disk workflows.


### 2026-11-03 ? Phase 6 allocation and dispatch implemented

- Added additive Prisma allocation/item, driver, dispatch/checklist, trip/event, evidence, transport-assignment and operational-exception models. Applied migration `20261103140000_phase6_operations`; all five migrations are up to date. Existing vehicle, inventory, ticket, organization/vendor, user, depot, storage, notification and audit records are reused.
- Backend: Created `modules/operations` validation/service/routes and central `inventory/operations.integration.ts` transaction primitives. Added approved-ticket partial/bulk allocation, cancellation, selector filters, driver/partner assignment, checklists, original photo/document uploads, readiness/confirmation, trip creation/status/timeline, exceptions/resolution, reports and scoped future-tracking metadata. Locks/idempotency/constraints prevent concurrent over-allocation, double vehicle/driver dispatch and duplicate plans. Inventory custody/status updates remain centralized.
- Permissions: Added narrow `trips:update` for linked assigned drivers; enabled existing allocation/dispatch permissions with additive `operations:enable` script. Enforced assigned source depot, requesting/receiving organization, transporter and exact driver account scope.
- Approval prerequisites: Hardened reassignment role/control checks, ticket submit/update locks and approved-detail preservation; applied Fleet scope to vehicle references and central inventory scope/expiry to ticket availability. Restricted approval policy configuration to Super Admin/JSAN Admin. Added ticket fulfillment summary/action and automatic completion after full delivered quantity; protected allocated fulfillment from unrelated ticket status changes.
- Frontend: Added allocation dashboard/queue/selector/create/details/reporting, dispatch planning/checklists/evidence/confirmation/history, trip list/details/milestones, drivers, existing transport partners and exceptions. Reused plain CSS/components/theme, added lazy loading and local-time-safe license editing. Activated completed ticket/dispatch sidebar links.
- Verification: Backend and frontend production builds passed; migration status verified; frontend route/module HTTP 200 and API/database healthy. Phase 6 workflow suite passed 134 checks; final guard suite passed 34 checks; existing inventory suite passed 139 assertions. Additional policy/tracking/report/trip/filter checks passed. Test outputs are saved under docs/phase6-*.txt. Both dev servers are running (5173 frontend, 4000 API).
- Documentation: Created `docs/PHASE6_OPERATIONS.md` with API contract, all screens, architecture, complete file manifest, tests and limitations; updated README. Added reproducible enable/test scripts. No new runtime dependency was installed.
- Synthetic artifacts: Retained P6/P4 vehicles, driver profiles, tickets, evidence, trip/reconciliation/audit records. The synthetic driver test account links to a test profile. These are development data; commercial planning baseline remains 802.
- Boundaries/limitations: No Phase 7 GPS/maps, full Phase 8 receiving/photo comparison or disk workflows. Delivered stock remains unavailable until receiving verification. Post-departure cancellation retains transport custody with an explicit recovery exception; reassignment is pre-departure. Browser visual/keyboard testing remains unverified. Previous dependency audit and unrelated Phase 5 UI/SLA recommendations remain documented. Full source/documentation manifest is in the Phase 6 document.
- Generated Prisma client and ignored backend/frontend build outputs refreshed. Stopped after Phase 6 for user review.


### 2026-11-03 ? Phase 7 tracking started

- Inspected current trip/dispatch, authentication, inventory and map/realtime placeholders.
- Planned additive provider/device/mapping/session/location/alert/geofence/event/state/policy models, referencing existing vehicles and trips. Real and simulated sessions remain separate; GPS never confirms delivery or changes custody.
- Installing stable Leaflet 1.9.4 and ws with TypeScript definitions; consulted official Leaflet/ws and OpenStreetMap tile documentation. No GPS hardware/provider or credentials are assumed. Real credentials will remain server environment references.


### 2026-11-03 - Phase 7 live GPS tracking implemented

- Added provider/device/mapping/session/immutable-location/alert/geofence/event/state/policy schema and migration 20261103170000_phase7_tracking; applied all six migrations and regenerated Prisma. Additive tracking:enable grants existing role permissions and creates labelled simulation provider metadata only.
- Added normalized provider interface and generic signed HMAC webhook / administrator HTTPS API pull adapters, explicit SIMULATED manual updates, event/fingerprint deduplication, concurrent ingestion locks, late-packet chronological history without projection rewind, actual-trip timestamp windows, no-fix handling and server-only credential environment references. Provider failures are safely logged.
- Added scoped sessions, latest snapshots, history/replay, geofence entry/exit, explicit planned-route approval, offline/stale/signal/stop/delay/window/deviation/proximity/completion alerts, deduplication, operator acknowledgement/resolution, notifications, audit access records and configurable retention. GPS never changes trip status, inventory, custody, delivery or ticket fulfillment.
- Attached authenticated native ws channel, fresh permission/expiry checks, heartbeat/backpressure/limits, scoped snapshots, reconnect behavior and five-second maintenance worker. Added raw-body webhook parsing, route mounting, server cleanup and Vite WebSocket proxy configuration.
- Replaced tracking placeholder with shared-theme nested screens, lazy-loaded Leaflet map, last-known/offline styles, source labels, recorded route/gap handling, sample replay/export, device mapping/start controls, provider/policy settings, alerts, geofences and reports. Added Phase 6 trip links and removed tracking from Coming Soon. Prevented cached source-filter data from appearing under a different source.
- Added ws/Leaflet TypeScript dependencies and jsdom map-test dev dependency, package scripts, synthetic workflow/map checks, backend/frontend environment examples, README and docs/PHASE7_TRACKING.md including complete API contract, production credentials, file manifest and limits.
- Final validation: 206 combined Phase 6/7 workflow assertions; 34 operational guard checks; 159 inventory assertions; 10 React/Leaflet marker movement/provenance/empty-state assertions. Both production builds passed. Frontend tracking HTTP, API proxy and WebSocket proxy/auth checks passed. Saved results under docs/phase7-*-results.txt.
- A development-watch restart interrupted one verification run; completed its synthetic trip through normal operational APIs, restored default policy and reran successfully against the compiled stable backend. Retained fixtures remain explicitly synthetic; no REAL GPS coordinates were fabricated.
- Outstanding acceptance: actual GPS provider/hardware credentials/protocol, production tile service selection/traffic planning, and real browser visual/keyboard/mobile QA. Existing dependency audit findings remain (backend 10 / frontend 2 at install); no unrelated breaking upgrades. No Phase 8 work performed.

- Final review added explicit GPS signal state, first/last recorded endpoint labels and observation-based stationary periods; NO_FIX samples and history navigation cannot reuse a prior marker/source. Completed synthetic webhook providers were disabled, defaults restored (stale 120s / offline 300s / stop 600s), and the backend was restarted without the temporary fixture secret. Frontend final production build passed.

### 2026-11-04 - Run app in browser

- Application code changes: None. Started backend and frontend development servers in hidden background processes and opened http://localhost:5173 in the default browser.
- Verification: Frontend returned HTTP 200; backend health endpoint responded successfully. Runtime logs saved under backend/ and frontend/ as dev-server.out.log and dev-server.err.log.

### 2026-11-04 — Verify Phase 8 & Phase 9 (by Claude)

- Changes: None. Run-only verification task; no application, configuration, or documentation code changed.
- Setup: The backend was running but its health endpoint returned 503 because the dedicated local PostgreSQL 18 cluster (port 5433) was stopped. Started it with `scripts/local-db.ps1 start`. After startup, `/api/v1/health` reported the database connected and `prisma migrate status` showed all 9 migrations applied ("Database schema is up to date").
- Verification: Ran `npm run test:reports` (Phase 9 — Dashboard & Reporting): **31/31 assertions passed** (dashboard summary/charts/monitoring, all nine report datasets, CSV/XLSX/PDF export totals matching the screen, role/organization isolation, saved reports, scheduled interface, export history). Ran `npm run test:inspections` (Phase 8 — Inspection & Digital Handover, chained through the Phase 6 operations fixture): **205/205 checks passed** (immutable submitted inspections, pre-dispatch gating, discrepancy workflow, MAJOR damage marking a vehicle DAMAGED only via the Inventory service, digital handover acknowledgements, idempotent POD, scope/RBAC isolation, amendments retaining original photos). The Phase 8 suite does not require `GPS_PHASE7_TEST_SECRET` (only the Phase 7 tracking suite does), so no backend restart was needed. Frontend served HTTP 200 and the Vite `/api/v1` proxy returned HTTP 200.
- Limitations: Build + API/aggregation level verification only; real browser visual/keyboard/mobile QA remains outstanding, consistent with the Phase 8/9 docs. Synthetic `P6-`-prefixed fixture records were retained by the inspection suite. No Phase 10 work performed.

### 2026-11-04 — Phase 10 Disk & Media Logistics completed and verified (by Claude)

- Context: A prior session had scaffolded Phase 10 (backend module, Prisma models + applied migration, enable script, mounted routes, RBAC) but left it unverified, with a placeholder frontend, no test suite and no docs. User approved completing it. Phases 1–9 remain unchanged.
- Backend (pre-existing, verified): Confirmed `src/modules/disk-logistics` (service/routes/validators), the 12 `Disk*` Prisma models and migration `20261104120000_phase10_disk_logistics` (already applied; `prisma migrate status` clean), the six mounted routers, and `disk:read/manage/review` in `rbac.ts`. Backend `npm run typecheck` passes. Ran `npm run disk:enable` to grant the disk permissions to roles (idempotent; no data created).
- Backend (new): Added `scripts/test-disk.cjs` — a 63-assertion Phase 10 suite (auth boundary; lookups/dashboard; register/duplicate/bulk; list filter/pagination/detail ledgers; valid vs invalid status transitions; custody transfer + in-shipment guard; shipment plan→dispatch→track→receive with EXCEPTION and clean DELIVERED paths; cancellation + disk release; discrepancy state machine with `disk:review` gating and CONFIRMED MAJOR → DAMAGED; reconciliation draft→submit→review with approved MISSING → LOST and ops-manager review denial; vendor RBAC + cross-vendor scope isolation; idempotency replay vs key-reuse). Its `login` tolerates the shared auth rate limiter (HTTP 429) with Retry-After backoff.
- Frontend (new): `src/types/disk.ts`, `src/services/diskService.ts` (idempotency-keyed), `src/modules/disk-logistics/pages/DiskLogisticsPage.tsx` (full tabbed module with nested routes: Overview, Disks + detail, Shipments + detail, Reconciliation + detail, Discrepancies — replacing the placeholder) and `DiskLogistics.css`. Manage/review actions gated by `canManage`/`canReview` from `/disks/lookups`.
- Frontend (modified): `src/routes/AppRoutes.tsx` (`/disk-logistics` → nested `/disk-logistics/*`); `src/layouts/Sidebar/Sidebar.tsx` (activated the disk link — and additionally un-hid the already-shipped, verified Inspections and Reports links that were still incorrectly marked "coming soon").
- Docs: Created `docs/PHASE10_DISK_LOGISTICS.md` and `docs/phase10-test-results.txt`; added a Phase 10 section to `README.md` and corrected the stale roadmap table (phases 6–10).
- Verification: `npm run test:disk` = 63/63 (exit 0; output saved). Regressions green — `npm run test:inspections` 205/205, `npm run test:reports` 31/31. Backend `typecheck` and frontend `typecheck` + production `build` all pass (frontend build exit 0; only Vite's chunk-size advisory). Prior to testing, started the dedicated local PostgreSQL 18 cluster on port 5433 via `scripts/local-db.ps1 start` (it was stopped; backend health had been 503).
- Limitations: Verification is typecheck + production build + API/workflow level; real browser visual/keyboard/mobile QA remains outstanding. Disk photo upload/download is API-only (no UI widget yet); reconciliation item entry via UI is minimal. Synthetic `P10-`-prefixed records created by the suite are retained development data, never commercial stock.

### 2026-11-04 — Phase 11 Vendor Management implemented and verified (by Claude)

- Context: The `/vendors` sidebar item showed a "Soon" label and was a dead placeholder. Investigation: the backend `vendors` module was an empty stub (README only, not mounted); the frontend page was a `ModulePlaceholder`; `vendors:read`/`vendors:manage` permissions already existed. Vendors are `Organization` records of type VEHICLE_VENDOR/TRANSPORT_PARTNER (basic CRUD already existed via the `organizations` module + a thin Master-Data list). Built a real Vendor Management module over that identity — no duplicate vendor entity, nothing existing broken.
- Database: Added additive models `VendorProfile` (1:1 Organization; code, registration, category, address, onboardedAt, notes), `VendorContact[]`, `VendorLocation[]` with Organization relations. Migration `20261104150000_phase11_vendor_management` applied (11 migrations total). Regenerated Prisma client (required stopping the dev server, which locks the query-engine DLL).
- Backend (new): `src/modules/vendors/vendors.service.ts`, `vendors.routes.ts`, `vendors.validators.ts`, mounted at `/api/v1/vendors`; `scripts/enable-vendors.ts`; `scripts/test-vendors.cjs` (33-assertion suite, rate-limit-tolerant login). Endpoints: lookups, list, register, detail (with operational summary), update, status (activate/deactivate with a custody guard), contacts CRUD (single-primary rule), locations CRUD, assigned-user list/assign/unassign (via `User.organizationId`, foreign-org assignment rejected), and vendor-wise vehicle/disk inventory. Vendor users are scoped to their own org for reads and denied all writes; summaries reuse existing cross-module org fields (Vehicle.organizationId/vendorId, DiskInventory custodian, allocations/dispatches/inspections/tickets).
- Backend (modified): `prisma/schema.prisma`, `src/routes/index.ts` (mount `/vendors`), `src/modules/auth/rbac.ts` (grant `vendors:read` to VENDOR_USER), `src/modules/vendors/README.md`, `package.json` (`vendors:enable`, `test:vendors`). Ran `npm run vendors:enable`.
- Frontend (new): `src/types/vendor.ts`, `src/services/vendorService.ts`, `src/modules/vendors/pages/VendorsPage.tsx` (full module: list + register + rich detail with profile/contacts/locations/users/vehicles/disks + status), `src/modules/vendors/Vendors.css` — replacing the placeholder.
- Frontend (modified): `src/routes/AppRoutes.tsx` (`/vendors` → nested `/vendors/*`); `src/layouts/Sidebar/Sidebar.tsx` (removed `/vendors` from the "coming soon" set — only `/settings` remains).
- Docs: Created `docs/PHASE11_VENDOR_MANAGEMENT.md` and `docs/phase11-test-results.txt`; added a Phase 11 section + roadmap row to `README.md`.
- Verification: `npm run test:vendors` = 33/33 (exit 0; output saved). Regressions green — disk 63/63, inspections 205/205, reports 31/31. Backend `typecheck` and frontend `typecheck` + production `build` all pass. Because running all suites exceeds the default auth rate limit (10 logins / 15 min), the regression batch was run against the API started with `AUTH_RATE_LIMIT_MAX=1000` (shell env override; `.env` untouched), then the backend was restarted with the default limit restored.
- Limitations: UI user-assignment takes a user id (no searchable picker yet); allocations/dispatches/inspections appear as summary counts on the vendor page (drill-down lives in those modules); real browser visual/keyboard/mobile QA outstanding. Synthetic `P11-` vendors retained as dev data.

### 2026-11-04 — Phase 12 Settings implemented and verified (by Claude)

- Context: `/settings` was the last "Soon" sidebar placeholder. Investigation: `settings:manage` permission existed but was granted to no role; the frontend page was a `ModulePlaceholder`; there was no backend settings module (no persistence). Built a real Settings module — additive, nothing existing broken.
- Database: Added `SystemSetting` (key/category/label/description/valueType/value/defaultValue/isEditable/updatedById), `UserPreference` (1:1 with User: theme/density/defaultLanding/notifyEmail/notifyInApp) and the `SettingValueType` enum, plus a `User.preference` relation. Migration `20261104170000_phase12_settings` applied (12 migrations total). Regenerated the Prisma client (stopped the dev server first — it locks the query-engine DLL on Windows).
- Backend (new): `src/modules/settings/settings.service.ts` (typed system-settings registry with idempotent default-catalogue seeding that never overwrites saved values + validation per valueType; per-user preferences created lazily), `settings.routes.ts` (mounted at `/api/v1/settings`), `settings.validators.ts`; `scripts/enable-settings.ts`; `scripts/test-settings.cjs` (17-assertion suite, rate-limit-tolerant login).
- Backend (modified): `prisma/schema.prisma`, `src/routes/index.ts` (mount `/settings`), `src/modules/auth/rbac.ts` (grant `settings:manage` to JSAN_ADMIN; SUPER_ADMIN already has `*`), `package.json` (`settings:enable`, `test:settings`). Ran `npm run settings:enable` (seeded 8 settings).
- Frontend (new): `src/types/settings.ts`, `src/services/settingsService.ts`, `src/modules/settings/pages/SettingsPage.tsx` (tabbed module: System settings grouped by category with per-row typed editor + Save/Reset, and My preferences), `src/modules/settings/Settings.css` — replacing the placeholder.
- Frontend (modified): `src/layouts/Sidebar/Sidebar.tsx` (removed `/settings` from the "coming soon" set — the set is now empty; every sidebar module is functional). The `/settings` route already existed and needed no change (tabbed page, not nested routes).
- Docs: Created `docs/PHASE12_SETTINGS.md` and `docs/phase12-test-results.txt`; added a Phase 12 section + roadmap row to `README.md`.
- Verification: `npm run test:settings` = 17/17 (exit 0; output saved). Regressions green — vendors 33/33, disk 63/63, inspections 205/205, reports 31/31. Backend `typecheck` and frontend `typecheck` + production `build` all pass. The 5-suite batch was run against the API started with `AUTH_RATE_LIMIT_MAX=1000` (shell override; `.env` untouched), then the backend was restarted with the default limit restored.
- Limitations: System-setting values form a persisted/audited registry but are not yet consumed at runtime by every module; preferences are stored but not yet applied app-wide (e.g. theme); `/settings` remains gated on `settings:manage`, so only admins reach the preferences tab. Real browser visual/keyboard/mobile QA outstanding. No further phase started.

### 2026-11-04 — Phase 12 follow-up: wire settings into behaviour + apply preferences (by Claude)

- Scope: user asked to (1) make settings actually affect behaviour, (2) apply preferences visually, (3) do a browser QA pass. Additive; no existing behaviour removed.
- Backend: `settings.service.ts` gained `getValue`/`getBool`/`getPublic`; `settings.routes.ts` added `GET /settings/public` (any authenticated user → organizationName, defaultPageSize, supportEmail). `operations.service.ts` now derives the pre-dispatch-required gate from `settingsService.getBool('inspections.preDispatchRequired', <env fallback>)` instead of reading the env flag directly (imported `settingsService`).
- Frontend: new `src/context/AppConfigContext.tsx` (loads preferences + public settings in the authenticated shell and writes `data-theme`/`data-density` to `<html>`, resolving `system` via `prefers-color-scheme`, resetting on unmount); new `src/styles/theme.css` (dark-mode token remap + compact-density spacing + `--color-*` aliases for the newer module CSS), imported from `global.css`. `AppLayout` wraps the shell in `AppConfigProvider`; `Sidebar` shows the live organization name; `SettingsPage` preferences save calls `applyPreferences` for instant effect; `LoginPage` honours the preferred default landing page after sign-in; the Vendors list uses the configured `defaultPageSize`. Added `settingsApi.getPublic` + `PublicSettings` type.
- Verification: backend + frontend `typecheck` and frontend production `build` pass. Full suite re-run green — settings 17, inspections 205 (confirms the DB-driven pre-dispatch gate did not regress dispatch confirmation), vendors 33, disk 63, reports 31 (run with `AUTH_RATE_LIMIT_MAX=1000`, then default restored). QA smoke: all module API endpoints and SPA routes returned 200; confirmed changing `general.organizationName` flows through `GET /settings/public` and resets. Opened `/settings` in the browser for a human visual pass.
- Limitations: only `organizationName`, `defaultPageSize` (Vendors list) and `inspections.preDispatchRequired` are wired to live behaviour so far; other catalogue entries remain stored-only. Dark mode may have minor inconsistencies where older module CSS hard-codes colours. A human visual QA pass (especially dark mode) is still advisable — I cannot see the rendered page.

### 2026-11-04 — Add demo script (by Claude)

- Files changed: `docs/DEMO_SCRIPT.md` (created). Documentation only; no application code changed.
- Changes: Wrote a presenter's demo script covering every module (setup checklist, demo accounts, recommended flow, per-module Pitch/Do/Highlight for all 12 phases + Users/Roles, an end-to-end golden path, a data-isolation walkthrough, architecture/differentiators for Q&A, and tips/gotchas/FAQ). Reflects the current implemented state, including the Phase 12 settings wiring and honest not-yet-built caveats.
- Verification: Documentation-only. Confirmed the app was healthy (API ok/db connected, frontend HTTP 200) when writing so the script's routes/accounts match the running build.

### 2026-11-04 — Remove phase docs; rewrite demo script (by Claude)

- Files deleted: all per-phase docs and test-output files under `docs/` — `PHASE2_AUTH.md`, `PHASE3_FLEET.md`, `PHASE4_INVENTORY.md`, `PHASE5_TICKETING.md`, `PHASE6_OPERATIONS.md`, `PHASE7_TRACKING.md`, `PHASE8_INSPECTIONS.md`, `PHASE9_REPORTING.md`, `PHASE10_DISK_LOGISTICS.md`, `PHASE11_VENDOR_MANAGEMENT.md`, `PHASE12_SETTINGS.md` and every `phase*-*.txt` results file. Requested by the user as unnecessary. Kept `README.md`, `ARCHITECTURE.md`, `INVENTORY_ARCHITECTURE.md`, `DEMO_SCRIPT.md` and the `FleetGo_User_Guide.*` files.
- Files changed: `docs/DEMO_SCRIPT.md` — replaced the long presenter script with a concise, client-facing, role-first page-by-page script (roles table, then Purpose/Features/Flow per page, an end-to-end story, the isolation closer, and tips).
- Note / remaining limitation: `README.md` still contains the per-phase narrative sections and links that now point at the deleted files (dead links). Left as-is pending a decision to trim the README for a client-facing repo.
- Verification: Documentation/file-removal only; no application code changed. App left running and healthy.

### 2026-11-05 — Vendor documents (agreements & consent forms) (by Claude)

- Scope: user asked that creating a vendor include a consent-form upload button and an other-documents button; also manageable afterwards. Additive; nothing existing changed.
- Database: added `VendorDocument` model (+ `VendorDocumentCategory` enum: CONSENT/AGREEMENT/OTHER) with an Organization relation; migration `20261105090000_vendor_documents` applied (13 migrations total). Regenerated Prisma client (stopped dev server first for the Windows DLL lock).
- Backend (`modules/vendors`): added `listDocuments`/`addDocument`/`downloadDocument`/`deleteDocument` to the service (files go to object storage via the shared `storage` provider, folder `vendors/{id}`; metadata only in DB; rollback on failure); added routes `GET /vendors/:id/documents`, `POST /vendors/:id/documents` (multipart `uploadSingle("file")`, `vendors:manage`), `GET /vendors/:id/documents/:docId/download`, `DELETE /vendors/:id/documents/:docId`; `getById` now includes `vendorDocuments`. Reused the existing upload middleware (allows PDF + images, size-limited). Added `DOCUMENT_CATEGORIES` to validators.
- Frontend (`modules/vendors`): added `VendorDocument`/`VendorDocumentCategory` types; `vendorService` gained `documents`/`uploadDocument`/`downloadDocument`/`deleteDocument`; the **Register vendor** form now has a **Consent form** (single) and **Other documents** (multiple) file picker that upload against the new vendor right after creation; the vendor detail page has a new **Documents** card (upload with category, list, download, remove), gated by `canManage`. Added a `.fg-vendor__file` style.
- Verification: `npm run test:vendors` = 40/40 (incl. upload/list/detail-include/download, 415 reject for unsupported type, vendor-user upload denied, delete). Backend typecheck + frontend typecheck/build pass. Additive-only; other suites unaffected.
- Note: the previously generated `FleetGo.zip` predates this feature and is now stale.

### 2026-11-05 — Ticket create: choose requesting vendor + scope vehicle list (by Claude)

- Problem: the Create Ticket form never let an admin/ops raise a request on behalf of a specific vendor — the requesting org was only inferred from the logged-in user, so an admin's ticket wasn't attributed to the right vendor and the vehicle dropdown wasn't scoped.
- Finding: the BACKEND already supported it — `tickets.service.create` uses `input.requestingOrgId` for internal actors (`tickets:manage`/`tickets:approve`) and forces the actor's own org otherwise. Only the frontend was missing the control. No backend change needed.
- Frontend (`modules/tickets/pages/CreateTicketPage.tsx`): added a **Requesting vendor / organization** Select shown only to internal actors (admin/ops), populated from `vendorApi.list` (vendor + transport orgs), sent as `requestingOrgId`. The vehicle dropdown now reloads filtered by the chosen vendor (`fleetService.list({ vendorId })`) for admin/ops; vendor users remain server-scoped to their own custody and don't see the selector. Changing the vendor clears any selected vehicle.
- Verification: frontend typecheck + production build pass. Live API check: an admin creating a ticket with `requestingOrgId=Vendor Beta` produced `requestingOrg = Vendor Beta Fleet`; a vendor user attempting `requestingOrgId=Vendor Beta` was correctly forced to their own org (Vendor Alpha), confirming no cross-vendor spoofing. (Two synthetic "TEST ..." tickets were created during verification and left as dev data.)

### 2026-11-05 — Ticket create: vehicle model instead of type + contact fields (by Claude)

- Request: all vehicles are cars (single type), so replace the "Vehicle type" selector with "Vehicle model", and add a contact person name + contact number to the request.
- Frontend only (`modules/tickets/pages/CreateTicketPage.tsx`): the DELIVERY/NEW_VEHICLE structured field changed from `type` → `model`, loading options from Master Data → Models (`masterDataService.list('models', { pageSize: 200, active: 'true' })` — the list endpoint caps pageSize at 200). The chosen model is stored (by name) in the ticket `details.model`, so it needs no schema change and displays on the ticket. Added always-visible **Contact person name** (`details.contactName`) and **Contact number** (`details.contactNumber`) inputs for every type; removed the old per-type `contact` detail on DELIVERY. Stopped sending `requestedTypeId` (allocation's optional type pre-filter simply no longer pre-populates — harmless with one type). Availability preview now queries overall availability (no type filter).
- `TicketDetailsPage.tsx`: detail keys are now humanized (e.g. `contactName` → "Contact Name", `model` → "Model") instead of shown raw.
- Verification: frontend typecheck + production build pass. Live API check: a ticket created with `details {model, contactName, contactNumber, deliveryLocation}` round-tripped intact. Note: Master Data → Models currently holds only synthetic `ZModel-*` entries from earlier tests; real car models should be added there for a meaningful dropdown.

### 2026-11-05 — Default vehicle type to "Car" (by Claude)

- Request: all vehicles are cars — default the type to "Car" rather than remove the concept.
- Data (via API, dev DB): created a "Car" vehicle type and deactivated the other five (Pickup/Sedan/SUV/Truck/Van) so "Car" is the only active/selectable type. Reversible (reactivate via Master Data); existing vehicles keep their original type reference.
- Frontend (`modules/fleet/pages/VehicleFormPage.tsx`): a new vehicle now defaults `typeId` to the "Car" type after types load; also fixed the models lookup to use `pageSize: 200` (the list endpoint rejects >200, which had been erroring the models dropdown). The type dropdown already filters to active types, so only "Car" now appears.
- Verification: frontend typecheck + production build pass. Master Data → types API confirms "Car" is the sole active type.


### 2026-11-04 - Detailed nontechnical user guide

- Files added: docs/FleetGo_User_Guide.md, docs/FleetGo_User_Guide.html, scripts/build-user-guide.py. Updated this log.
- Changes: Created a plain-language guide covering account access, navigation, roles, statuses, each implemented workflow, administrator tasks, pending features, troubleshooting, a delivery example, and daily checklists. Added a standalone printable HTML version with clickable contents and a print or Save as PDF button, plus a reproducible builder.
- Verification: Cross-checked the guide against frontend screens and module documentation. Validated all 28 numbered sections, unique heading anchors and contents links. No application code changed. Word output was not produced because the required packaged rendering workflow is unavailable in this environment; browser print layout has not been visually verified.


### 2026-11-05 - Project overview and review

- Application source changes: None. Reviewed project structure, mounted APIs, frontend service/auth integration, migrations, recent ticket/vendor/settings changes and documentation.
- Findings: User guide incorrectly labels implemented Vendors, Disk Logistics and Settings as placeholders; README links reference removed phase documents. Ticket car model is stored as descriptive details and not enforced by allocation validation. Vendor creation completes before document uploads, so upload failure leaves a created vendor without a recovery-specific UI. Several persisted system settings are not connected to runtime consumers.
- Verification: Backend npm run typecheck and frontend npm run build passed. Frontend build required execution outside the filesystem sandbox and reported a 500 kB chunk-size advisory. Generated frontend dist/build metadata refreshed. Tracking-map test results reported separately in the task response. Workflow/database mutation suites and interactive browser QA were not run.


### 2026-11-05 - Premium automotive UI using supplied car photographs

- Scope: UI only as requested. No backend, API, authentication, permissions, form handling, inventory rules, allocation/dispatch logic, database records or migrations changed.
- Added frontend/src/components/AutomotiveBanner/AutomotiveBanner.tsx and AutomotiveBanner.css: route-aware editorial car photography, larger dashboard hero, compact module banners, dashboard photo collection, image entrance and a single 4.5-second decorative car drive across a road accent. Reduced-motion preference disables the effects; banners are excluded from printing. Photographs are explicitly decorative and never replace actual vehicle/inspection evidence.
- Added frontend/src/styles/automotive.css: graphite/mint sidebar, refined workspace surfaces, buttons, tables, focus treatment, responsive spacing and dark-theme overrides. Updated frontend/src/layouts/AppLayout/AppLayout.tsx to display the shared visual banner and load the presentation stylesheet.
- Updated frontend/src/modules/auth/components/AuthShell.tsx and AuthShell.css: replaced the decorative route illustration with supplied car photography and an inset coastal image, added a responsive gallery and brief entrance animation, retained the existing sign-in forms and behavior. Fixed the story background color after visual review to preserve white-text contrast.
- Added six unchanged copies of supplied images under frontend/src/assets/cars: sunset-drive.jpg (image 6), highland-drive.jpg (image 5), coastal-drive.jpg (image 9), garden-drive.jpg (image 1), lakeside-drive.jpg (image 11), country-drive.jpg (image 8). Original images folder remains unchanged.
- Verification: production build passed before final CSS polish; final build result recorded below. Reviewed real login screenshots at 1440px and 390px and isolated real banner components at desktop, mobile and dark theme. Checks found no broken images, horizontal overflow or browser page errors; reduced-motion animation-name is none. Used installed Edge headless with existing Playwright after interactive browser runtimes failed to start. Full authenticated workflows were not exercised because this task changes presentation only.
- Temporary visual-review page frontend/car-ui-preview.html was removed. Local review scripts/screenshots/contact sheet are under .tmp/car-ui-review; generated frontend/dist and configured TypeScript metadata refreshed. Existing Vite main-chunk size advisory remains.

- Final verification: frontend npm run build passed after the contrast and reduced-motion refinements (TypeScript and Vite production bundling). Only the existing main-chunk size advisory remains.

### 2026-11-05 - Repeat banner car animation

- Files changed: frontend/src/components/AutomotiveBanner/AutomotiveBanner.css and codex.md.
- Changes: Changed the shared banner car animation from a single run to an infinite 4.5-second loop, as requested. The dashboard and other shared automotive banners repeat the animation. Existing reduced-motion behavior remains unchanged; no application logic changed.
- Verification: Confirmed the CSS uses infinite iteration and the reduced-motion rule still disables the car animation. CSS-only change; no build rerun required.


### 2026-11-05 - Slow banner car animation

- Files changed: frontend/src/components/AutomotiveBanner/AutomotiveBanner.css and codex.md.
- Changes: Increased the repeating car animation duration from 4.5 to 9 seconds for a slower crossing. Reduced-motion support and application logic remain unchanged.
- Verification: Confirmed the animation declaration uses 9s with infinite repetition. CSS-only adjustment; no build rerun.


### 2026-11-05 - Car photo background behind sign-in form

- Files changed: frontend/src/modules/auth/components/AuthShell.tsx, AuthShell.css and codex.md.
- Changes: Added the existing supplied lakeside car photograph as a decorative background behind the authentication form, a dark photo overlay, and a translucent light form card with a solid fallback. Refined surrounding text contrast and responsive card spacing. Shared authentication pages inherit the presentation. No login, reset-password, API or business logic changed.
- Verification: Reviewed real login screenshots at 1440px desktop and 390px mobile with installed Edge headless; no horizontal overflow on mobile. Form labels, inputs, sign-in action and account links remain readable. Local screenshots refreshed under .tmp/car-ui-review; production build verification follows.

- Final verification: frontend production build passed (TypeScript and Vite). Existing main-chunk size advisory remains; generated frontend/dist and TypeScript metadata refreshed.

### 2026-11-05 - Blurred glass authentication form

- Files changed: frontend/src/modules/auth/components/AuthShell.css and codex.md.
- Changes: Replaced the white authentication card with a translucent graphite glass surface using 22px backdrop blur and subtle saturation. Added a darker fallback for browsers without blur support and light heading, label, link and hint colors for readability. Inputs remain clear and readable. Shared authentication pages inherit this visual treatment. No application logic changed.
- Verification: Reviewed desktop (1440px) and mobile (390px) login screenshots after the CSS change; no horizontal overflow on mobile. Existing local review screenshots updated under .tmp/car-ui-review. CSS-only change; no production build rerun.


### 2026-11-05 - Trial full-page authentication photo and centered glass form

- Files changed: frontend/src/modules/auth/components/AuthShell.tsx, AuthShell.css and codex.md. Added exact rollback copies ui-backups/auth-split-layout/AuthShell.tsx and AuthShell.css before editing.
- Changes: Removed the left story/gallery from the shared authentication shell, used lakeside-drive.jpg as the full-page background, centered the existing blurred form, and moved the FleetGo brand to the upper left. Confirmed the bundled lakeside-drive.jpg is byte-identical to the requested images/image (11).jpg. Preserved existing form children, links, authentication and recovery logic. Desktop/mobile layouts allow scrolling when needed.
- Rollback: Copy both files from ui-backups/auth-split-layout back into frontend/src/modules/auth/components to restore the exact preceding split-screen glass-form design. Do not overwrite these rollback copies while evaluating this trial.
- Verification: Frontend npm run build passed (TypeScript and Vite); existing chunk-size advisory remains. Reviewed headless Edge screenshots for desktop (1440px) and mobile (390px); also checked password recovery. All three checks show background loaded, 22px backdrop blur active, no left story section, no horizontal overflow and no browser page errors. QA scripts/screenshots saved under .tmp/car-ui-review. Generated frontend/dist and TypeScript metadata refreshed.


### 2026-11-05 - More car photography in dashboard fleet overview and sidebar

- Files added: frontend/src/components/CarPhotoCollection/CarPhotoCollection.tsx and CarPhotoCollection.css; four unchanged supplied photographs copied to frontend/src/assets/cars/heritage-drive.jpg (image 2), mountain-drive.jpg (image 14), woodland-drive.jpg (image 13), city-drive.jpg (image 10). Original images untouched.
- Files updated: frontend/src/modules/dashboard/pages/DashboardPage.tsx and frontend/src/modules/fleet/pages/FleetOverviewPage.tsx to add the photo collection below operational content; frontend/src/layouts/Sidebar/Sidebar.tsx and Sidebar.css to add an existing country-drive image behind the sidebar footer; codex.md.
- Changes: Added editorial car photography with captions, lazy image loading, responsive four/two-column layouts and a restrained hover zoom disabled for reduced motion. The photo collection is hidden when printing. Sidebar photo has a dark overlay and compact sizing on short windows. Photographs are separate from vehicle records and evidence. No business logic, APIs, permissions or data changed. Accepted full-page login design remains unchanged and its earlier rollback backup is retained.
- Verification: frontend production build passed (TypeScript and Vite; existing chunk-size advisory). Reviewed isolated collection screenshots at desktop/mobile widths and dark theme; all four photos loaded with no horizontal overflow. Full authenticated page workflows and sidebar interactions were not rerun. Temporary frontend/car-collection-preview.html removed after QA; screenshots and review script retained under .tmp/car-ui-review. Generated frontend/dist and TypeScript metadata refreshed.


### 2026-11-05 — Ticket damage/replacement/maintenance: extra fields + photo/video evidence (by Claude)

- Request: for DAMAGE, REPLACEMENT and MAINTENANCE tickets keep type-specific fields (what is damaged, severity, etc.) and allow uploading photos (timestamped) and videos.
- Backend: added `uploadMediaSingle` to `middlewares/upload.ts` (allows images + PDF + video — mp4/webm/quicktime/avi/mkv — up to 100 MB; the shared `uploadSingle` stays images+PDF/10 MB) and exported it from `middlewares/index.ts`. `tickets.routes.ts` attachment upload now uses `uploadMediaSingle` so videos are accepted. The existing `TicketAttachment` model/endpoints (list/upload/download) and `createdAt` timestamp were reused — no schema change.
- Frontend (`CreateTicketPage.tsx`): enriched detail fields — DAMAGE_INCIDENT now has "What is damaged" + Severity (plus existing incident date/location/description/category); REPLACEMENT adds "What needs replacing" + Severity. Added photo (image/*, multiple) and video (video/*, multiple) pickers shown for damage/replacement/maintenance; after the ticket is created the files are uploaded as attachments. `CreateTicket.css` got media styles.
- Frontend (`TicketDetailsPage.tsx`): attachment list now shows a Photo/Video tag and the upload timestamp, and the inline upload input accepts video too.
- Verification: backend + frontend typecheck and frontend production build pass. Live check: created a DAMAGE ticket (details {damagedParts, severity, description, contact} round-tripped) and uploaded a PNG and an MP4 via the attachments endpoint — both accepted with contentType + createdAt; list shows both. (Synthetic "TEST ..." tickets left as dev data.)
- Limitation: the create form uploads evidence only after the ticket row exists (attachments need a ticket id), consistent with vendor documents; a failed upload still leaves the created ticket.

### 2026-11-05 — User Management: role-specific profile details (by Claude)

- Request: capture extra details per role in User Management — e.g. driver → licence, address, contact.
- Database: added additive `UserProfile` model (1:1 with User: licenseNumber/licenseExpiry/licenseClass, addressLine/city/state/postalCode, emergencyContactName/Phone, dateOfBirth, notes) + `User.profile` relation; migration `20261105140000_user_profiles` applied. Regenerated Prisma client (stopped dev server first for the Windows DLL lock). Note: distinct from the existing transporter `Driver` model, which is a separate fleet-dispatch concept.
- Backend (`modules/users`): `createUserSchema`/`updateUserSchema` gained an optional `profile` object (`userProfileSchema`; blank strings → undefined, dates coerced). `users.service` includes `profile` in `userSelect`, creates it on create (when any field set) and upserts it on update.
- Frontend (`UserFormModal.tsx` + `.css`, `types/auth.ts`, `userService.ts`): the user form now shows role-aware fields — when the selected role is `TRANSPORTER_DRIVER` it shows a Driver licence section (number/class/expiry) + date of birth; all roles get address (line/city/state/postal) and emergency contact. Values load on edit and submit in create/update payloads.
- Verification: backend + frontend typecheck and frontend production build pass. Live check: created a user with the driver role and a full profile via the API; GET /users/:id returned the stored profile (licence, address, emergency contact, DOB) intact.
- Limitation: licence fields are collected only for the driver role (hidden for others); they are optional (not enforced-required) so a driver can still be saved without a licence if left blank.
