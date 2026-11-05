# Notifications Module

Notifications — email/in-app notification dispatch.

## Status
Placeholder — not implemented in Phase 1.

## Planned structure
When implemented, this module will contain its own:

- `notifications.routes.ts`       — Express router, mounted under `/api/v1/notifications`
- `notifications.controller.ts`   — HTTP request/response handling
- `notifications.service.ts`      — business logic
- `notifications.repository.ts`   — Prisma data access
- `notifications.validators.ts`   — Zod request schemas
- `notifications.types.ts`        — module-specific types

Register the router in `src/routes/index.ts` when the module is ready.
