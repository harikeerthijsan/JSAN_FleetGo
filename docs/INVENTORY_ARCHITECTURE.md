# FleetGo — Inventory Management Architecture

_Planning document. **No inventory functionality is implemented in Phase 1.**
Inventory Management is a standalone core module scheduled for **Phase 4**.
The entities and relationships below are planning-level; they will be reviewed
and normalized during implementation._

---

## 1. Purpose & Scope

Inventory Management maintains a **centralized, authoritative inventory of every
vehicle received from Google CTS**. It is a **standalone top-level module** —
deliberately independent of Fleet Management — because custody, location, and
movement of physical assets is a distinct concern from fleet operations.

For every vehicle the system must eventually track:

- Unique vehicle identification.
- Specifications and registration details.
- Photographs and supporting documents.
- Initial receiving condition.
- Current depot / location.
- Current vendor or custodian.
- Availability status and reservation status.
- Dispatch, receiving, and transfer history.
- Inventory reconciliation.

Inventory must update automatically whenever a vehicle is **received,
reserved, dispatched, transferred, returned, or moved into maintenance**.

### Onboarding methods

1. **Bulk import** of existing inventory via Excel/CSV.
2. **Individual registration** of newly received vehicles (with photo uploads).

### Scale

Planning baseline: **802 vehicles**. The design scales well beyond that, but
8,000+ is **not** confirmed scope and is not treated as a requirement.

---

## 2. Core Design Principle — Ledger + Derived State

To guarantee correct counts and custody, inventory state is **never** a
hand-maintained number. Instead:

- **`VehicleMovement`** is an append-only, immutable **ledger** of every event
  that changes a vehicle's location/custody/availability.
- **`VehicleInventory`** holds the **current derived state** (current depot,
  current custody, availability, reservation) — always reconstructable by
  replaying the ledger.
- Every state change is written **inside a single database transaction** that
  (a) appends the movement and (b) updates the derived state, so the two can
  never diverge.

This prevents duplicate allocation, incorrect stock counts, and inconsistent
custody records.

---

## 3. Planned Entities

> Planning-level. Some may be merged/split or modeled as enums during
> normalization. These are **not** created in Phase 1.

### Vehicle

The physical asset and its static-ish attributes.

| Field                | Notes                                             |
| -------------------- | ------------------------------------------------- |
| `id`                 | Internal unique id                                |
| `vin`                | Unique vehicle identification number              |
| `registrationNumber` | Unique                                            |
| `make`, `model`, `year`, `color` | Specifications                        |
| `specifications`     | Flexible JSON for additional specs                |
| `status`             | lifecycle: `received`, `active`, `maintenance`, `retired` |

### VehicleInventory (current derived state)

One row per vehicle representing its **current** inventory position.

| Field                 | Notes                                             |
| --------------------- | ------------------------------------------------- |
| `vehicleId`           | → Vehicle (1:1)                                   |
| `currentDepotId`      | → Depot                                           |
| `currentCustodyId`    | → VehicleCustody (who currently holds it)         |
| `availability`        | `available`, `reserved`, `dispatched`, `in_transit`, `maintenance`, `returned` |
| `activeReservationId` | → VehicleReservation (nullable)                   |
| `lastMovementId`      | → VehicleMovement (nullable)                      |

### Depot

Physical locations where vehicles are stored. Enables **depot-wise inventory**.

`id`, `name`, `code`, `address`, `region`, `capacity`.

### Vendor

External vendors/custodians. Enables **vendor-wise inventory**.

`id`, `name`, `code`, `contact`, `type`.

### VehicleCustody

Who currently holds a vehicle (depot, vendor, or internal custodian) and since
when. Historical custody is derivable from movements.

`id`, `vehicleId`, `custodianType` (`depot` | `vendor` | `user`),
`custodianId`, `fromDate`, `toDate` (nullable while current).

### VehicleReservation

A hold placed on an available vehicle (typically from an approved ticket)
before dispatch, preventing double-allocation.

`id`, `vehicleId`, `reservedBy`, `reservedForTicketId`, `status`
(`active` | `released` | `fulfilled` | `expired`), `reservedAt`, `expiresAt`.

### VehicleMovement (immutable ledger)

Append-only record of every inventory-changing event.

| Field          | Notes                                                           |
| -------------- | --------------------------------------------------------------- |
| `id`           |                                                                 |
| `vehicleId`    | → Vehicle                                                       |
| `type`         | `received`, `reserved`, `dispatched`, `transferred`, `returned`, `maintenance_in`, `maintenance_out` |
| `fromDepotId`  | nullable                                                        |
| `toDepotId`    | nullable                                                        |
| `fromCustody`  | nullable                                                        |
| `toCustody`    | nullable                                                        |
| `referenceType`/`referenceId` | links to the ticket/trip/inspection that caused it |
| `occurredAt`   |                                                                 |
| `recordedBy`   | user/actor                                                      |

### VehicleInspection

Condition capture at key moments (receiving, dispatch, receiving-back,
periodic). Owned conceptually by the Inspection module but referenced by
inventory movements.

`id`, `vehicleId`, `type` (`receiving` | `dispatch` | `return` | `periodic`),
`condition`, `notes`, `inspectedBy`, `inspectedAt`, `movementId` (nullable).

### VehiclePhoto

Metadata/reference for an image. **Binary is stored in object storage, never in
PostgreSQL** — this row holds only the storage key/URL and context.

`id`, `vehicleId`, `context` (`receiving` | `dispatch` | `return` |
`inspection` | `document`), `storageKey`, `url`, `contentType`, `size`,
`uploadedBy`, `uploadedAt`, `inspectionId` (nullable).

### InventoryReconciliation

Periodic physical-vs-system reconciliation runs and their discrepancies.

`id`, `depotId`, `startedBy`, `startedAt`, `completedAt`, `status`;
plus `ReconciliationItem` rows: `vehicleId`, `expectedState`, `observedState`,
`discrepancy`, `resolved`.

---

## 4. Relationships (planned)

```
Vehicle 1───1 VehicleInventory
Vehicle 1───* VehicleMovement        (immutable ledger)
Vehicle 1───* VehicleCustody         (history; one current)
Vehicle 1───* VehicleReservation     (one active at a time)
Vehicle 1───* VehicleInspection
Vehicle 1───* VehiclePhoto

Depot   1───* VehicleInventory       (currentDepotId)  → depot-wise inventory
Depot   1───* VehicleMovement        (from/to)
Vendor  1───* VehicleCustody         (vendor-wise inventory via custody)

VehicleReservation *───1 Ticket      (reservedForTicketId)
VehicleMovement    *───1 (Ticket|Trip|Inspection)  via referenceType/referenceId
VehiclePhoto       *───1 VehicleInspection (optional)
InventoryReconciliation 1───* ReconciliationItem *───1 Vehicle
```

---

## 5. Cross-Module Interactions

Inventory is the **system of record for vehicle custody, location, and
availability**. Other modules drive inventory transitions but do not own the
state.

```
                         ┌──────────────────────────────────────────┐
                         │          INVENTORY (system of record)      │
                         │   VehicleInventory (state) + Movement (log)│
                         └──────────────────────────────────────────┘
                              ▲        ▲         ▲        ▲        ▲
         reserve/release ─────┘        │         │        │        │
   (from approved tickets)             │         │        │        │
                                       │         │        │        │
   ALLOCATION ─ reserves an available vehicle ───┘         │        │
                                                 dispatch   │        │
   DISPATCH ─ marks dispatched / in_transit ───────────────┘        │
            ─ on delivery: custody → vendor/depot, status update     │
                                                                     │
   INSPECTION ─ receiving/dispatch/return condition ─ emits movement + photos
                                                                     │
   TRACKING ─ reads current vehicle + depot context (location feed) ─┘
```

- **Fleet Management** — operational grouping/status of vehicles. **Independent
  of Inventory**; it reads inventory for availability but does not mutate
  custody/movement.
- **Tickets & Approvals** — an approved request triggers a **reservation**.
- **Allocation** — converts a reservation into an assignment and requests a
  **dispatch movement** (transactional: fails if the vehicle is no longer
  available).
- **Dispatch & Trips** — records `dispatched` / `in_transit` / `returned`
  movements and updates custody on handover; attaches proof-of-delivery photos.
- **Inspection & Digital Handover** — condition capture produces
  `VehicleInspection` + `VehiclePhoto` rows linked to the movement that
  occurred at dispatch/receiving.
- **Tracking** — consumes current vehicle/depot context; live GPS does not
  change inventory custody.
- **Reports** — reads derived state and the movement ledger for depot-wise /
  vendor-wise inventory and reconciliation reporting.

---

## 6. Transactional Guarantees (implementation-time)

Every custody/availability change will be performed in a single Prisma
interactive transaction:

```ts
await prisma.$transaction(async (tx) => {
  // 1. Re-check current state with a row lock (prevent double-allocation).
  // 2. Append an immutable VehicleMovement.
  // 3. Update VehicleInventory derived state + custody + reservation.
});
```

Reservations expire, and allocation re-validates availability inside the
transaction, so two concurrent requests can never allocate the same vehicle.

---

## 7. Bulk Import & File Storage Readiness

- **Bulk import** (Excel/CSV) will validate rows, upsert `Vehicle` +
  `VehicleInventory`, and emit `received` movements — all transactional, with a
  per-row error report. (Not implemented in Phase 1.)
- **File storage**: `VehiclePhoto`/document binaries use the Phase 1 storage
  abstraction (`StorageProvider`), stored in object storage (S3/GCS) in
  production. PostgreSQL holds only metadata/references.

---

## 8. Phase 1 Summary

Implemented now: **nothing functional** — only the standalone top-level module
(route `/inventory`, sidebar item, placeholder page) and this architecture.
Everything above is delivered in **Phase 4**.
