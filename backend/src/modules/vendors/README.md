# Vendors Module

Phase 11 — Vendor Management. A vendor is an `Organization` of type
`VEHICLE_VENDOR` or `TRANSPORT_PARTNER`; this module reuses that identity and
adds the vendor workspace (profile, contacts, locations, assigned users, status,
and vendor-wise vehicle/disk inventory). Mounted under `/api/v1/vendors`.

## Status
Implemented and mounted.

## Structure
- `vendors.routes.ts`      — Express router (mounted at `/api/v1/vendors`)
- `vendors.service.ts`     — business logic, scope isolation and aggregation
- `vendors.validators.ts`  — Zod request schemas

Data access goes directly through the shared Prisma client (`database/prisma`),
consistent with the other business modules. Additive detail tables
(`VendorProfile`, `VendorContact`, `VendorLocation`) live in `prisma/schema.prisma`.

## Permissions
- `vendors:read` — view vendors in scope (vendor users: own org only).
- `vendors:manage` — register, edit, status, contacts, locations, assign users (admins).

Run `npm run vendors:enable` to grant these to the appropriate roles. See
`docs/PHASE11_VENDOR_MANAGEMENT.md` for the full API and tests.
