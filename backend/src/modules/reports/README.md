# Reports Module (Phase 9)

Dashboard & reporting aggregation over the existing FleetGo modules — the
single source of truth. No business data is duplicated.

## Status
Implemented in Phase 9.

## Structure
- `reports.service.ts` — dashboard summary/charts/monitoring + tabular report datasets (fleet, inventory, tickets, dispatch/delivery, GPS, inspections, discrepancies, vendor performance)
- `reports.admin.ts`   — saved reports, export history, scheduled-report interface (config + status only; no email/credentials)
- `reports.export.ts`  — CSV / XLSX (exceljs) / print-ready HTML serializers
- `reports.routes.ts`  — routers mounted at `/api/v1/dashboard` and `/api/v1/reports`

Every query is scoped by role and organization (reusing `inventoryScope`,
`dispatchScope`, `inspectionScope` plus vehicle/ticket/discrepancy scopes).
Aggregation uses Prisma `groupBy`/`count`; lists are paginated; exports reuse
the same scoped dataset so totals match the screen. Metric definitions and
limitations are in `docs/PHASE9_REPORTING.md`.
