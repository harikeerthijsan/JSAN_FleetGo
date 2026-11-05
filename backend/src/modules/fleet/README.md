# Fleet Module

Fleet Management — fleet grouping, vehicle operational status, assignments.

## Status
Placeholder — not implemented in Phase 1.

## Planned structure
When implemented, this module will contain its own:

- `fleet.routes.ts`       — Express router, mounted under `/api/v1/fleet`
- `fleet.controller.ts`   — HTTP request/response handling
- `fleet.service.ts`      — business logic
- `fleet.repository.ts`   — Prisma data access
- `fleet.validators.ts`   — Zod request schemas
- `fleet.types.ts`        — module-specific types

Register the router in `src/routes/index.ts` when the module is ready.
