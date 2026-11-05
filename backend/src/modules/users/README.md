# Users Module

Users & Roles — user accounts, roles and permissions (Phase 2).

## Status
Placeholder — not implemented in Phase 1.

## Planned structure
When implemented, this module will contain its own:

- `users.routes.ts`       — Express router, mounted under `/api/v1/users`
- `users.controller.ts`   — HTTP request/response handling
- `users.service.ts`      — business logic
- `users.repository.ts`   — Prisma data access
- `users.validators.ts`   — Zod request schemas
- `users.types.ts`        — module-specific types

Register the router in `src/routes/index.ts` when the module is ready.
