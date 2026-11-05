# Allocation Module

Vehicle Allocation — reserving and allocating available vehicles to approved tickets.

## Status
Placeholder — not implemented in Phase 1.

## Planned structure
When implemented, this module will contain its own:

- `allocation.routes.ts`       — Express router, mounted under `/api/v1/allocation`
- `allocation.controller.ts`   — HTTP request/response handling
- `allocation.service.ts`      — business logic
- `allocation.repository.ts`   — Prisma data access
- `allocation.validators.ts`   — Zod request schemas
- `allocation.types.ts`        — module-specific types

Register the router in `src/routes/index.ts` when the module is ready.
