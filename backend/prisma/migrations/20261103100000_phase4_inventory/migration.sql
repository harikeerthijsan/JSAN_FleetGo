-- CreateEnum
CREATE TYPE "CustodianType" AS ENUM ('DEPOT', 'VENDOR', 'ORGANIZATION', 'USER');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('RECEIPT', 'DEPOT_TRANSFER', 'DEPOT_TO_VENDOR', 'VENDOR_TO_DEPOT', 'DISPATCH', 'DELIVERY', 'MAINTENANCE', 'CUSTODY_CHANGE', 'RETURN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "ReconciliationScope" AS ENUM ('DEPOT', 'VENDOR', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReconciliationItemResult" AS ENUM ('PENDING', 'VERIFIED', 'MISSING', 'MISPLACED', 'DAMAGED', 'UNEXPECTED');

-- AlterEnum
ALTER TYPE "VehicleStatus" ADD VALUE 'AT_VENDOR';

-- CreateTable
CREATE TABLE "vehicle_inventory" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "inInventory" BOOLEAN NOT NULL DEFAULT true,
    "receiptId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedFromOrgId" TEXT,
    "receivingDepotId" TEXT,
    "initialCondition" TEXT,
    "odometer" INTEGER,
    "accessories" TEXT,
    "currentDepotId" TEXT,
    "currentCustodianType" "CustodianType",
    "currentCustodianId" TEXT,
    "activeReservationId" TEXT,
    "lastMovementId" TEXT,
    "lastMovementAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_receipts" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedFromOrgId" TEXT,
    "receivingDepotId" TEXT,
    "initialCondition" TEXT,
    "odometer" INTEGER,
    "accessories" TEXT,
    "remarks" TEXT,
    "receivedById" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_movements" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "fromDepotId" TEXT,
    "toDepotId" TEXT,
    "fromCustodianType" "CustodianType",
    "fromCustodianId" TEXT,
    "toCustodianType" "CustodianType",
    "toCustodianId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initiatedById" TEXT,
    "reference" TEXT,
    "reason" TEXT,
    "remarks" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_custody" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "custodianType" "CustodianType" NOT NULL,
    "custodianId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toDate" TIMESTAMP(3),
    "movementId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_custody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_reservations" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "requestingOrgId" TEXT,
    "depotId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT,
    "reference" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reconciliations" (
    "id" TEXT NOT NULL,
    "scope" "ReconciliationScope" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "startedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_items" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "vehicleRef" TEXT,
    "expectedStatus" "VehicleStatus",
    "expectedDepotId" TEXT,
    "expectedUpdatedAt" TIMESTAMP(3),
    "expectedCustodianType" "CustodianType",
    "expectedCustodianId" TEXT,
    "observedDepotId" TEXT,
    "result" "ReconciliationItemResult" NOT NULL DEFAULT 'PENDING',
    "discrepancy" TEXT,
    "remarks" TEXT,

    CONSTRAINT "reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "reconciliationId" TEXT,
    "type" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "reason" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_photos" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT,
    "reconciliationId" TEXT,
    "reconciliationItemId" TEXT,
    "movementId" TEXT,
    "context" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_operations" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_allocations" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "allocatedById" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_inventory_vehicleId_key" ON "vehicle_inventory"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_inventory_receiptId_key" ON "vehicle_inventory"("receiptId");

-- CreateIndex
CREATE INDEX "vehicle_inventory_currentDepotId_idx" ON "vehicle_inventory"("currentDepotId");

-- CreateIndex
CREATE INDEX "vehicle_inventory_currentCustodianType_currentCustodianId_idx" ON "vehicle_inventory"("currentCustodianType", "currentCustodianId");

-- CreateIndex
CREATE INDEX "vehicle_inventory_inInventory_idx" ON "vehicle_inventory"("inInventory");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_receipts_vehicleId_key" ON "vehicle_receipts"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_receipts_idempotencyKey_key" ON "vehicle_receipts"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_movements_idempotencyKey_key" ON "vehicle_movements"("idempotencyKey");

-- CreateIndex
CREATE INDEX "vehicle_movements_vehicleId_idx" ON "vehicle_movements"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_movements_type_idx" ON "vehicle_movements"("type");

-- CreateIndex
CREATE INDEX "vehicle_custody_vehicleId_idx" ON "vehicle_custody"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_reservations_vehicleId_startDate_endDate_idx" ON "vehicle_reservations"("vehicleId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "vehicle_reservations_vehicleId_status_idx" ON "vehicle_reservations"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "vehicle_reservations_status_idx" ON "vehicle_reservations"("status");

-- CreateIndex
CREATE INDEX "inventory_reconciliations_scope_scopeId_idx" ON "inventory_reconciliations"("scope", "scopeId");

-- CreateIndex
CREATE INDEX "inventory_reconciliations_status_idx" ON "inventory_reconciliations"("status");

-- CreateIndex
CREATE INDEX "reconciliation_items_reconciliationId_idx" ON "reconciliation_items"("reconciliationId");

-- CreateIndex
CREATE INDEX "inventory_adjustments_vehicleId_idx" ON "inventory_adjustments"("vehicleId");

-- CreateIndex
CREATE INDEX "inventory_photos_reconciliationId_idx" ON "inventory_photos"("reconciliationId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_operations_actorId_key_key" ON "inventory_operations"("actorId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_allocations_reference_key" ON "inventory_allocations"("reference");

-- CreateIndex
CREATE INDEX "inventory_allocations_vehicleId_releasedAt_idx" ON "inventory_allocations"("vehicleId", "releasedAt");

-- AddForeignKey
ALTER TABLE "vehicle_inventory" ADD CONSTRAINT "vehicle_inventory_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "inventory_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_photos" ADD CONSTRAINT "inventory_photos_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "inventory_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Additional PostgreSQL integrity and append-only ledger constraints.
ALTER TABLE "vehicle_receipts" ADD CONSTRAINT "vehicle_receipts_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_receipts" ADD CONSTRAINT "vehicle_receipts_receivedFromOrgId_fk" FOREIGN KEY ("receivedFromOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_receipts" ADD CONSTRAINT "vehicle_receipts_receivingDepotId_fk" FOREIGN KEY ("receivingDepotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_receipts" ADD CONSTRAINT "vehicle_receipts_receivedById_fk" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_movements" ADD CONSTRAINT "vehicle_movements_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_movements" ADD CONSTRAINT "vehicle_movements_fromDepotId_fk" FOREIGN KEY ("fromDepotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_movements" ADD CONSTRAINT "vehicle_movements_toDepotId_fk" FOREIGN KEY ("toDepotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_movements" ADD CONSTRAINT "vehicle_movements_initiatedById_fk" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_custody" ADD CONSTRAINT "vehicle_custody_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_custody" ADD CONSTRAINT "vehicle_custody_movementId_fk" FOREIGN KEY ("movementId") REFERENCES "vehicle_movements"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_custody" ADD CONSTRAINT "vehicle_custody_createdById_fk" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_reservations" ADD CONSTRAINT "vehicle_reservations_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_reservations" ADD CONSTRAINT "vehicle_reservations_requestingOrgId_fk" FOREIGN KEY ("requestingOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_reservations" ADD CONSTRAINT "vehicle_reservations_depotId_fk" FOREIGN KEY ("depotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_reservations" ADD CONSTRAINT "vehicle_reservations_createdById_fk" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_inventory" ADD CONSTRAINT "vehicle_inventory_receiptId_fk" FOREIGN KEY ("receiptId") REFERENCES "vehicle_receipts"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_inventory" ADD CONSTRAINT "vehicle_inventory_receivedFromOrgId_fk" FOREIGN KEY ("receivedFromOrgId") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_inventory" ADD CONSTRAINT "vehicle_inventory_receivingDepotId_fk" FOREIGN KEY ("receivingDepotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_inventory" ADD CONSTRAINT "vehicle_inventory_currentDepotId_fk" FOREIGN KEY ("currentDepotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_inventory" ADD CONSTRAINT "vehicle_inventory_activeReservationId_fk" FOREIGN KEY ("activeReservationId") REFERENCES "vehicle_reservations"("id") ON DELETE RESTRICT;
ALTER TABLE "vehicle_inventory" ADD CONSTRAINT "vehicle_inventory_lastMovementId_fk" FOREIGN KEY ("lastMovementId") REFERENCES "vehicle_movements"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_reconciliations" ADD CONSTRAINT "inventory_reconciliations_startedById_fk" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_reconciliations" ADD CONSTRAINT "inventory_reconciliations_reviewedById_fk" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_expectedDepotId_fk" FOREIGN KEY ("expectedDepotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_observedDepotId_fk" FOREIGN KEY ("observedDepotId") REFERENCES "depots"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_reconciliationId_fk" FOREIGN KEY ("reconciliationId") REFERENCES "inventory_reconciliations"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_approvedById_fk" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_photos" ADD CONSTRAINT "inventory_photos_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_photos" ADD CONSTRAINT "inventory_photos_uploadedById_fk" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_photos" ADD CONSTRAINT "inventory_photos_movementId_fk" FOREIGN KEY ("movementId") REFERENCES "vehicle_movements"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_photos" ADD CONSTRAINT "inventory_photos_reconciliationItemId_fk" FOREIGN KEY ("reconciliationItemId") REFERENCES "reconciliation_items"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_operations" ADD CONSTRAINT "inventory_operations_actorId_fk" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_vehicleId_fk" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_organizationId_fk" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_allocatedById_fk" FOREIGN KEY ("allocatedById") REFERENCES "users"("id") ON DELETE RESTRICT;

ALTER TABLE vehicle_reservations ADD CONSTRAINT reservation_period CHECK ("endDate" > "startDate");
ALTER TABLE vehicle_inventory ADD CONSTRAINT inventory_custodian_pair CHECK (("currentCustodianType" IS NULL) = ("currentCustodianId" IS NULL));
ALTER TABLE vehicle_receipts ADD CONSTRAINT receipt_odometer CHECK (odometer IS NULL OR odometer >= 0);
CREATE UNIQUE INDEX reservation_one_active ON vehicle_reservations ("vehicleId") WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX custody_one_current ON vehicle_custody ("vehicleId") WHERE "toDate" IS NULL;
CREATE UNIQUE INDEX allocation_one_current ON inventory_allocations ("vehicleId") WHERE "releasedAt" IS NULL;
CREATE UNIQUE INDEX reconciliation_one_vehicle ON reconciliation_items ("reconciliationId", "vehicleId") WHERE "vehicleId" IS NOT NULL;
CREATE FUNCTION fleetgo_immutable_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Inventory history is append-only'; END; $$;
CREATE TRIGGER movement_immutable BEFORE UPDATE OR DELETE ON vehicle_movements FOR EACH ROW EXECUTE FUNCTION fleetgo_immutable_ledger();
CREATE TRIGGER receipt_immutable BEFORE UPDATE OR DELETE ON vehicle_receipts FOR EACH ROW EXECUTE FUNCTION fleetgo_immutable_ledger();
CREATE TRIGGER adjustment_immutable BEFORE UPDATE OR DELETE ON inventory_adjustments FOR EACH ROW EXECUTE FUNCTION fleetgo_immutable_ledger();
