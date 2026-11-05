# Inspections Module (Phase 8)

Vehicle Inspection & Digital Handover — condition capture at CTS receipt,
pre-dispatch, receiving and return; dispatch-vs-receiving photo comparison;
damage/discrepancy management; digital handover with acknowledgements; and
Proof of Delivery.

## Status
Implemented in Phase 8.

## Structure
- `inspections.validators.ts` — Zod request schemas
- `inspections.service.ts`    — business logic (inspections, discrepancies, handover, POD)
- `inspections.routes.ts`     — routers mounted at `/api/v1/inspections`, `/api/v1/handover`, `/api/v1/discrepancies`
- `pod.html.ts`               — server-rendered printable Proof of Delivery document

References to completed models (vehicle, dispatch, trip, ticket, organization,
depot, user) are stored as indexed `String` columns, not Prisma relations, so
existing models are untouched. Mutations are atomic + idempotent via the shared
inventory `operation` wrapper. Serious confirmed damage marks a vehicle
unavailable only through the centralized Inventory service; GPS proximity and
image differences never confirm delivery, custody or damage.

See `docs/PHASE8_INSPECTIONS.md` for the full API, data model, permissions,
screens, tests and known issues.
