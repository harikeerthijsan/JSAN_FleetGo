# Audit Module

Audit Logs — immutable record of significant system actions.

## Status
Placeholder — not implemented in Phase 1.

## Planned structure
When implemented, this module will contain its own:

- `audit.routes.ts`       — Express router, mounted under `/api/v1/audit`
- `audit.controller.ts`   — HTTP request/response handling
- `audit.service.ts`      — business logic
- `audit.repository.ts`   — Prisma data access
- `audit.validators.ts`   — Zod request schemas
- `audit.types.ts`        — module-specific types

Register the router in `src/routes/index.ts` when the module is ready.
