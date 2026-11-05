# Auth Module

Authentication — login, token issuance/refresh, password handling (Phase 2).

## Status
Placeholder — not implemented in Phase 1.

## Planned structure
When implemented, this module will contain its own:

- `auth.routes.ts`       — Express router, mounted under `/api/v1/auth`
- `auth.controller.ts`   — HTTP request/response handling
- `auth.service.ts`      — business logic
- `auth.repository.ts`   — Prisma data access
- `auth.validators.ts`   — Zod request schemas
- `auth.types.ts`        — module-specific types

Register the router in `src/routes/index.ts` when the module is ready.
