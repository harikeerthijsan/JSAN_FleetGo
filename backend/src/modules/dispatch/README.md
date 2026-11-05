# Dispatch Module

Dispatch & Trips — dispatching vehicles, trip lifecycle and proof of delivery.

## Status
Placeholder — not implemented in Phase 1.

## Planned structure
When implemented, this module will contain its own:

- `dispatch.routes.ts`       — Express router, mounted under `/api/v1/dispatch`
- `dispatch.controller.ts`   — HTTP request/response handling
- `dispatch.service.ts`      — business logic
- `dispatch.repository.ts`   — Prisma data access
- `dispatch.validators.ts`   — Zod request schemas
- `dispatch.types.ts`        — module-specific types

Register the router in `src/routes/index.ts` when the module is ready.
