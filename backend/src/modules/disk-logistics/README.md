# Disk-Logistics Module

Disk / Media Logistics — disk and media movement tracking.

## Status
Placeholder — not implemented in Phase 1.

## Planned structure
When implemented, this module will contain its own:

- `disk-logistics.routes.ts`       — Express router, mounted under `/api/v1/disk-logistics`
- `disk-logistics.controller.ts`   — HTTP request/response handling
- `disk-logistics.service.ts`      — business logic
- `disk-logistics.repository.ts`   — Prisma data access
- `disk-logistics.validators.ts`   — Zod request schemas
- `disk-logistics.types.ts`        — module-specific types

Register the router in `src/routes/index.ts` when the module is ready.
