# Tracking Module

GPS Tracking — live vehicle location ingestion and streaming (WebSocket).

## Status
Placeholder — not implemented in Phase 1.

## Planned structure
When implemented, this module will contain its own:

- `tracking.routes.ts`       — Express router, mounted under `/api/v1/tracking`
- `tracking.controller.ts`   — HTTP request/response handling
- `tracking.service.ts`      — business logic
- `tracking.repository.ts`   — Prisma data access
- `tracking.validators.ts`   — Zod request schemas
- `tracking.types.ts`        — module-specific types

Register the router in `src/routes/index.ts` when the module is ready.
